// Adapted from coucou (https://github.com/Louis-CFM/coucou), MIT License, Copyright (c) Louis Raillé
//! Captura del micrófono: cpal (WASAPI) → mono → 16 kHz → PCM i16 para Parakeet y la API.
//!
//! El stream de cpal no se puede mover entre hilos, así que vive en un hilo propio;
//! el callback guarda las muestras mono a la tasa nativa y el nivel del último bloque.
//! `stop` remuestrea todo a 16 kHz de una vez.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

/// Todo modelo trabaja con 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;
/// Tope de una grabación: al llegar, deja de guardar (corta sola).
pub const MAX_SECONDS: u32 = 120;
/// Mensaje que la isla muestra cuando no hay micrófono o Windows niega el permiso.
pub const MIC_ERROR: &str = "Sin acceso al micrófono";

// ── Funciones puras ───────────────────────────────────────────────────────────

/// Promedia los canales de cada cuadro intercalado.
pub fn downmix_to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    let ch = channels.max(1) as usize;
    if ch == 1 {
        return samples.to_vec();
    }
    samples.chunks_exact(ch).map(|f| f.iter().sum::<f32>() / ch as f32).collect()
}

/// Remuestreo por interpolación lineal; la salida mide `len · to / from` (redondeado).
pub fn resample_linear(input: &[f32], from_hz: u32, to_hz: u32) -> Vec<f32> {
    if from_hz == to_hz || input.is_empty() || from_hz == 0 || to_hz == 0 {
        return input.to_vec();
    }
    let out_len = ((input.len() as u64 * to_hz as u64 + from_hz as u64 / 2) / from_hz as u64) as usize;
    let step = from_hz as f64 / to_hz as f64;
    let last = input.len() - 1;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * step;
            let idx = (pos.floor() as usize).min(last);
            let frac = (pos - idx as f64) as f32;
            let a = input[idx];
            let b = input[(idx + 1).min(last)];
            a + (b - a) * frac
        })
        .collect()
}

/// WAV PCM 16 bits mono con cabecera de 44 bytes.
#[allow(dead_code)]
pub fn to_wav_bytes(pcm: &[i16], rate: u32) -> Vec<u8> {
    let data = (pcm.len() * 2) as u32;
    let mut b = Vec::with_capacity(44 + data as usize);
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36 + data).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes()); // PCM
    b.extend_from_slice(&1u16.to_le_bytes()); // mono
    b.extend_from_slice(&rate.to_le_bytes());
    b.extend_from_slice(&(rate * 2).to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&data.to_le_bytes());
    for s in pcm {
        b.extend_from_slice(&s.to_le_bytes());
    }
    b
}

fn to_i16(samples: &[f32]) -> Vec<i16> {
    samples.iter().map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16).collect()
}

// ── Dispositivos ──────────────────────────────────────────────────────────────

fn device_name(d: &cpal::Device) -> String {
    d.description().map(|desc| desc.name().to_string()).unwrap_or_default()
}

/// Nombres de los micrófonos, el predeterminado primero.
pub fn microphone_names() -> Vec<String> {
    let host = cpal::default_host();
    let default = host.default_input_device().map(|d| device_name(&d));
    let mut out: Vec<String> = Vec::new();
    if let Ok(devices) = host.input_devices() {
        for d in devices {
            let name = device_name(&d);
            if !name.is_empty() && !out.contains(&name) {
                out.push(name);
            }
        }
    }
    out.sort_by_key(|n| Some(n) != default.as_ref());
    out
}

fn open_device(name: Option<&str>) -> Option<cpal::Device> {
    let host = cpal::default_host();
    match name {
        Some(n) => host
            .input_devices()
            .ok()
            .and_then(|mut it| it.find(|d| device_name(d) == n))
            .or_else(|| host.default_input_device()),
        None => host.default_input_device(),
    }
}

// ── Grabación ─────────────────────────────────────────────────────────────────

/// No hay micrófono, Windows niega el permiso o el dispositivo no responde.
/// `to_string()` es siempre [`MIC_ERROR`]; `detail` trae la causa técnica.
#[derive(Debug, Clone)]
pub struct MicError {
    pub detail: String,
}

impl std::fmt::Display for MicError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(MIC_ERROR)
    }
}

impl std::error::Error for MicError {}

fn mic_err(detail: impl ToString) -> MicError {
    MicError { detail: detail.to_string() }
}

struct Shared {
    /// Mono a la tasa nativa del dispositivo.
    samples: Vec<f32>,
    max_len: usize,
}

/// Una grabación abierta. `stop` (o soltarla) cierra el dispositivo.
pub struct Recorder {
    shared: Arc<Mutex<Shared>>,
    level: Arc<AtomicU32>,
    rate: u32,
    stop_tx: Option<mpsc::Sender<()>>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Recorder {
    /// Abre el micrófono por nombre (o el predeterminado si no existe o es `None`).
    pub fn start(device: Option<&str>) -> Result<Recorder, MicError> {
        let device = device.map(str::to_string);
        let shared = Arc::new(Mutex::new(Shared { samples: Vec::new(), max_len: 0 }));
        let level = Arc::new(AtomicU32::new(0));
        let (ready_tx, ready_rx) = mpsc::channel::<Result<u32, MicError>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (sh, lv) = (shared.clone(), level.clone());
        let thread = std::thread::Builder::new()
            .name("lazo-audio".into())
            .spawn(move || {
                let (stream, rate) = match build_stream(device.as_deref(), sh, lv) {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                        return;
                    }
                };
                if let Err(e) = stream.play() {
                    let _ = ready_tx.send(Err(mic_err(e)));
                    return;
                }
                let _ = ready_tx.send(Ok(rate));
                let _ = stop_rx.recv();
                drop(stream);
            })
            .map_err(mic_err)?;
        let rate = match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(rate)) => rate,
            Ok(Err(e)) => {
                let _ = thread.join();
                return Err(e);
            }
            Err(_) => return Err(mic_err("el dispositivo de audio no respondió")),
        };
        Ok(Recorder { shared, level, rate, stop_tx: Some(stop_tx), thread: Some(thread) })
    }

    /// Nivel del último bloque (pico, 0–1).
    pub fn level(&self) -> f32 {
        f32::from_bits(self.level.load(Ordering::Relaxed))
    }

    /// Llegó al tope de [`MAX_SECONDS`] y ya no guarda más.
    pub fn is_full(&self) -> bool {
        let s = self.shared.lock().unwrap_or_else(|e| e.into_inner());
        s.max_len > 0 && s.samples.len() >= s.max_len
    }

    fn close(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }

    /// Cierra el micrófono y devuelve lo grabado en 16 kHz mono.
    pub fn stop(mut self) -> Vec<i16> {
        self.close();
        let samples = std::mem::take(&mut self.shared.lock().unwrap_or_else(|e| e.into_inner()).samples);
        to_i16(&resample_linear(&samples, self.rate, SAMPLE_RATE))
    }
}

impl Drop for Recorder {
    fn drop(&mut self) {
        self.close();
    }
}

fn build_stream(device: Option<&str>, shared: Arc<Mutex<Shared>>, level: Arc<AtomicU32>) -> Result<(cpal::Stream, u32), MicError> {
    let device = open_device(device).ok_or_else(|| mic_err("no hay micrófono"))?;
    let supported = device.default_input_config().map_err(mic_err)?;
    let channels = supported.channels().max(1);
    let rate = supported.sample_rate();
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    shared.lock().unwrap_or_else(|e| e.into_inner()).max_len = (rate * MAX_SECONDS) as usize;

    let push = move |data: Vec<f32>| {
        let mono = downmix_to_mono(&data, channels);
        let peak = mono.iter().fold(0.0f32, |m, &s| m.max(s.abs())).min(1.0);
        level.store(peak.to_bits(), Ordering::Relaxed);
        let mut s = shared.lock().unwrap_or_else(|e| e.into_inner());
        let room = s.max_len.saturating_sub(s.samples.len());
        let n = room.min(mono.len());
        s.samples.extend_from_slice(&mono[..n]);
    };
    let err_fn = |err: cpal::Error| eprintln!("audio: {err}");
    let stream = match format {
        cpal::SampleFormat::F32 => {
            device.build_input_stream::<f32, _, _>(config, move |d: &[f32], _| push(d.to_vec()), err_fn, None)
        }
        cpal::SampleFormat::I16 => device.build_input_stream::<i16, _, _>(
            config,
            move |d: &[i16], _| push(d.iter().map(|&s| s as f32 / 32768.0).collect()),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I32 => device.build_input_stream::<i32, _, _>(
            config,
            move |d: &[i32], _| push(d.iter().map(|&s| s as f32 / 2_147_483_648.0).collect()),
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream::<u16, _, _>(
            config,
            move |d: &[u16], _| push(d.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect()),
            err_fn,
            None,
        ),
        other => return Err(mic_err(format!("formato de audio no soportado: {other:?}"))),
    };
    Ok((stream.map_err(mic_err)?, rate))
}

// ── Comandos ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_microphones() -> Vec<String> {
    microphone_names()
}

/// Graba 2 s con el micrófono configurado y devuelve el pico (0–1).
#[tauri::command]
pub async fn mic_test(cfg: tauri::State<'_, Mutex<lazo_core::config::Config>>) -> Result<f32, String> {
    let mic = cfg.lock().unwrap_or_else(|e| e.into_inner()).voice.microphone.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let rec = Recorder::start(mic.as_deref()).map_err(|e| format!("{e}: {}", e.detail))?;
        std::thread::sleep(Duration::from_secs(2));
        let pcm = rec.stop();
        Ok(pcm.iter().map(|&s| (s as i32).unsigned_abs()).max().unwrap_or(0) as f32 / 32767.0)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmix_stereo_averages() {
        let stereo = [0.2, 0.4, -1.0, 1.0, 0.5, 0.0];
        let mono = downmix_to_mono(&stereo, 2);
        assert_eq!(mono.len(), 3);
        assert!((mono[0] - 0.3).abs() < 1e-6);
        assert!(mono[1].abs() < 1e-6);
        assert!((mono[2] - 0.25).abs() < 1e-6);
        assert_eq!(downmix_to_mono(&[0.1, 0.2], 1), vec![0.1, 0.2]);
    }

    #[test]
    fn resample_48k_to_16k_length() {
        let input: Vec<f32> = (0..48_000).map(|i| (i as f32 * 0.001).sin()).collect();
        let out = resample_linear(&input, 48_000, 16_000);
        assert!((out.len() as i64 - 16_000).abs() <= 1, "{} samples", out.len());
        // Mismo rango: no se inventa ni se pierde amplitud.
        assert!(out.iter().all(|s| s.abs() <= 1.0));
        assert_eq!(resample_linear(&input[..100], 16_000, 16_000), input[..100].to_vec());
    }

    #[test]
    fn wav_header_is_valid() {
        let pcm: Vec<i16> = vec![0, 1000, -1000, i16::MAX, i16::MIN];
        let b = to_wav_bytes(&pcm, 16_000);
        assert_eq!(&b[0..4], b"RIFF");
        assert_eq!(&b[8..16], b"WAVEfmt ");
        assert_eq!(u32::from_le_bytes([b[24], b[25], b[26], b[27]]), 16_000);
        assert_eq!(&b[36..40], b"data");
        assert_eq!(u32::from_le_bytes([b[40], b[41], b[42], b[43]]) as usize, 2 * pcm.len());
        assert_eq!(b.len(), 44 + 2 * pcm.len());
        assert_eq!(u32::from_le_bytes([b[4], b[5], b[6], b[7]]) as usize, b.len() - 8);
        assert_eq!(i16::from_le_bytes([b[46], b[47]]), 1000);
    }

    #[test]
    fn mic_error_has_spanish_message() {
        let e = mic_err("E_ACCESSDENIED");
        assert_eq!(e.to_string(), "Sin acceso al micrófono");
        assert_eq!(e.detail, "E_ACCESSDENIED");
    }
}
