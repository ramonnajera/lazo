// Adapted from coucou (https://github.com/Louis-CFM/coucou), MIT License, Copyright (c) Louis Raillé
//! Reconocimiento de voz local: Parakeet TDT 0.6B v3 (int8) vía sherpa-onnx.
//!
//! Nada se descarga hasta que el usuario lo pide en Configuración. Los archivos vienen de
//! Hugging Face en una revisión fija, se verifican (tamaño + SHA-256) y quedan en
//! `%APPDATA%\LazoDesktop\models\parakeet-tdt-0.6b-v3-int8\`.

use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use sha2::{Digest, Sha256};
use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig, OfflineTransducerModelConfig};
use tauri::{AppHandle, Emitter};

use crate::audio::SAMPLE_RATE;

pub const MODEL_ID: &str = "parakeet-tdt-0.6b-v3-int8";

struct ModelFile {
    name: &'static str,
    url: &'static str,
    size: u64,
    sha256: &'static str,
}

const FILES: &[ModelFile] = &[
    ModelFile {
        name: "encoder.int8.onnx",
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/2bda32ec70b097a55adaa07d9a7173915b43cc78/encoder.int8.onnx",
        size: 652_184_281,
        sha256: "acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247",
    },
    ModelFile {
        name: "decoder.int8.onnx",
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/2bda32ec70b097a55adaa07d9a7173915b43cc78/decoder.int8.onnx",
        size: 11_845_275,
        sha256: "179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e",
    },
    ModelFile {
        name: "joiner.int8.onnx",
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/2bda32ec70b097a55adaa07d9a7173915b43cc78/joiner.int8.onnx",
        size: 6_355_277,
        sha256: "3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3",
    },
    ModelFile {
        name: "tokens.txt",
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/2bda32ec70b097a55adaa07d9a7173915b43cc78/tokens.txt",
        size: 93_939,
        sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
    },
];

/// El error y sus causas ("error sending request" solo no dice nada).
fn error_chain(e: &dyn std::error::Error) -> String {
    let mut out = e.to_string();
    let mut src = e.source();
    while let Some(s) = src {
        out.push_str(": ");
        out.push_str(&s.to_string());
        src = s.source();
    }
    out
}

fn total_size() -> u64 {
    FILES.iter().map(|f| f.size).sum()
}

/// `%APPDATA%\LazoDesktop\models\parakeet-tdt-0.6b-v3-int8`
pub fn model_dir() -> PathBuf {
    let base = std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
    base.join("LazoDesktop").join("models").join(MODEL_ID)
}

fn file_path(name: &str) -> String {
    model_dir().join(name).to_string_lossy().to_string()
}

/// Todos los archivos están con su tamaño (el hash se verificó al descargarlos).
fn is_present() -> bool {
    FILES
        .iter()
        .all(|f| std::fs::metadata(model_dir().join(f.name)).map(|m| m.len() == f.size).unwrap_or(false))
}

// ── Estado de la descarga ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum ModelStatus {
    Missing,
    Downloading { pct: u8 },
    Ready,
}

/// Carga del evento `model-progress`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProgress {
    pub status: ModelStatus,
    pub error: Option<String>,
    pub size_mb: u64,
}

#[derive(Default)]
struct Downloads {
    running: bool,
    pct: u8,
    error: Option<String>,
}

fn downloads() -> &'static Mutex<Downloads> {
    static D: OnceLock<Mutex<Downloads>> = OnceLock::new();
    D.get_or_init(|| Mutex::new(Downloads::default()))
}

pub fn status() -> ModelStatus {
    let d = downloads().lock().unwrap_or_else(|e| e.into_inner());
    if d.running {
        ModelStatus::Downloading { pct: d.pct }
    } else if is_present() {
        ModelStatus::Ready
    } else {
        ModelStatus::Missing
    }
}

pub fn progress() -> ModelProgress {
    let error = downloads().lock().unwrap_or_else(|e| e.into_inner()).error.clone();
    ModelProgress { status: status(), error, size_mb: total_size() / 1_000_000 }
}

fn emit_progress(app: &AppHandle) {
    let _ = app.emit("model-progress", progress());
}

pub fn pct_of(done: u64, total: u64) -> u8 {
    if total == 0 {
        return 0;
    }
    ((done.min(total) as u128 * 100) / total as u128) as u8
}

/// Descarga lo que falte, con el avance en eventos `model-progress`.
pub fn download(app: AppHandle) {
    {
        let mut d = downloads().lock().unwrap_or_else(|e| e.into_inner());
        if d.running {
            return;
        }
        d.running = true;
        d.pct = 0;
        d.error = None;
    }
    emit_progress(&app);
    tauri::async_runtime::spawn(async move {
        let a = app.clone();
        let result = download_files(move |pct| {
            downloads().lock().unwrap_or_else(|e| e.into_inner()).pct = pct;
            emit_progress(&a);
        })
        .await;
        {
            let mut d = downloads().lock().unwrap_or_else(|e| e.into_inner());
            d.running = false;
            d.error = result.err();
        }
        emit_progress(&app);
    });
}

/// Descarga los archivos que falten (`.part` + rename), con el porcentaje cada 250 ms.
pub async fn download_files(mut on_progress: impl FnMut(u8)) -> Result<(), String> {
    let total = total_size();
    let mut done: u64 = 0;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .user_agent(concat!("LazoDesktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let dir = model_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear la carpeta del modelo: {e}"))?;
    let mut last_emit = Instant::now();
    for file in FILES {
        let path = dir.join(file.name);
        if std::fs::metadata(&path).map(|m| m.len() == file.size).unwrap_or(false) {
            done += file.size;
            continue;
        }
        let part = dir.join(format!("{}.part", file.name));
        let mut response = client
            .get(file.url)
            .send()
            .await
            .map_err(|e| format!("No se pudo descargar {}: {}", file.name, error_chain(&e)))?;
        if !response.status().is_success() {
            return Err(format!("No se pudo descargar {} (HTTP {})", file.name, response.status().as_u16()));
        }
        let mut out = std::fs::File::create(&part).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut got: u64 = 0;
        while let Some(chunk) = response.chunk().await.map_err(|e| format!("Descarga interrumpida: {}", error_chain(&e)))? {
            out.write_all(&chunk).map_err(|e| e.to_string())?;
            hash.update(&chunk);
            got += chunk.len() as u64;
            if got > file.size {
                break;
            }
            if last_emit.elapsed() > Duration::from_millis(250) {
                last_emit = Instant::now();
                on_progress(pct_of(done + got, total));
            }
        }
        out.flush().map_err(|e| e.to_string())?;
        drop(out);
        let hex: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if got != file.size || hex != file.sha256 {
            let _ = std::fs::remove_file(&part);
            return Err(format!("{}: el archivo descargado no es el esperado", file.name));
        }
        std::fs::rename(&part, &path).map_err(|e| e.to_string())?;
        done += file.size;
    }
    Ok(())
}

/// Borra el modelo (Configuración → Borrar modelo).
pub fn delete() -> Result<(), String> {
    if downloads().lock().unwrap_or_else(|e| e.into_inner()).running {
        return Err("Espera a que termine la descarga".into());
    }
    // Con el candado de carga: nadie carga el modelo mientras se borran sus archivos.
    let _guard = load_lock().lock().unwrap_or_else(|e| e.into_inner());
    unload();
    downloads().lock().unwrap_or_else(|e| e.into_inner()).error = None;
    match std::fs::remove_dir_all(model_dir()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("No se pudo borrar el modelo: {e}")),
    }
}

// ── Reconocimiento ────────────────────────────────────────────────────────────

fn recognizer_slot() -> &'static Mutex<Option<Arc<OfflineRecognizer>>> {
    static R: OnceLock<Mutex<Option<Arc<OfflineRecognizer>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(None))
}

/// Serializa la carga: dos llamadas nunca cargan el modelo dos veces.
fn load_lock() -> &'static Mutex<()> {
    static L: OnceLock<Mutex<()>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(()))
}

fn threads() -> i32 {
    std::thread::available_parallelism().map(|n| n.get().clamp(1, 4) as i32).unwrap_or(2)
}

/// El reconocedor cargado (se carga en el primer uso, unos segundos).
fn recognizer() -> Result<Arc<OfflineRecognizer>, String> {
    touch();
    if let Some(r) = recognizer_slot().lock().unwrap_or_else(|e| e.into_inner()).clone() {
        return Ok(r);
    }
    if !is_present() {
        return Err("El modelo de voz no está descargado".into());
    }
    let _guard = load_lock().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(r) = recognizer_slot().lock().unwrap_or_else(|e| e.into_inner()).clone() {
        return Ok(r);
    }
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.transducer = OfflineTransducerModelConfig {
        encoder: Some(file_path("encoder.int8.onnx")),
        decoder: Some(file_path("decoder.int8.onnx")),
        joiner: Some(file_path("joiner.int8.onnx")),
    };
    config.model_config.tokens = Some(file_path("tokens.txt"));
    config.model_config.model_type = Some("nemo_transducer".into());
    config.model_config.num_threads = threads();
    let r = OfflineRecognizer::create(&config).map(Arc::new).ok_or("No se pudo cargar el modelo de voz")?;
    *recognizer_slot().lock().unwrap_or_else(|e| e.into_inner()) = Some(r.clone());
    start_idle_watcher();
    Ok(r)
}

/// Carga el modelo en segundo plano. No se llama al arrancar: la isla lo llama cuando una
/// tecla empieza a grabar, así la carga (unos segundos) ocurre mientras el usuario habla.
/// `transcribe` lo carga igual si hace falta.
pub fn preload() {
    touch();
    if !is_present() || recognizer_slot().lock().unwrap_or_else(|e| e.into_inner()).is_some() {
        return;
    }
    std::thread::spawn(|| {
        let _ = recognizer();
    });
}

/// Tiempo sin uso tras el cual se libera la memoria del modelo (~700 MB).
pub const IDLE_UNLOAD: Duration = Duration::from_secs(10 * 60);

/// ¿Toca liberar el modelo? Solo si se usó alguna vez y lleva `idle` sin usarse.
pub fn should_unload(last_use: Option<Instant>, now: Instant, idle: Duration) -> bool {
    last_use.is_some_and(|t| now.checked_duration_since(t).is_some_and(|d| d >= idle))
}

fn last_use() -> &'static Mutex<Option<Instant>> {
    static U: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    U.get_or_init(|| Mutex::new(None))
}

/// Reinicia la cuenta de inactividad (cada `preload` y `transcribe`).
fn touch() {
    *last_use().lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
}

/// Un solo hilo, iniciado con la primera carga, que revisa cada 30 s si toca liberar.
fn start_idle_watcher() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        std::thread::Builder::new()
            .name("lazo-asr-idle".into())
            .spawn(|| loop {
                std::thread::sleep(Duration::from_secs(30));
                let loaded = recognizer_slot().lock().unwrap_or_else(|e| e.into_inner()).is_some();
                let last = *last_use().lock().unwrap_or_else(|e| e.into_inner());
                if loaded && should_unload(last, Instant::now(), IDLE_UNLOAD) {
                    let _guard = load_lock().lock().unwrap_or_else(|e| e.into_inner());
                    // Una transcripción en curso conserva su Arc; solo se suelta la del slot.
                    unload();
                }
            })
            .ok();
    });
}

pub fn unload() {
    *recognizer_slot().lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// Tramo más largo que recibe el modelo de una vez.
const MAX_CHUNK_SECONDS: f64 = 28.0;

/// Audio largo en tramos que el modelo acepta, cada uno cortado en los 100 ms más
/// silenciosos de sus últimos 8 s. Devuelve (desplazamiento en muestras, muestras).
pub fn split_for_model(samples: &[f32], rate: u32, max_seconds: f64) -> Vec<(usize, &[f32])> {
    let max = (max_seconds * rate as f64) as usize;
    let window = (rate as usize) / 10;
    let mut out = Vec::new();
    let mut start = 0;
    while start < samples.len() {
        if samples.len() - start <= max {
            out.push((start, &samples[start..]));
            break;
        }
        let search_from = start + max.saturating_sub(8 * rate as usize);
        let mut best = start + max;
        let mut best_energy = f64::MAX;
        let mut at = search_from;
        while at + window <= start + max {
            let e: f64 = samples[at..at + window].iter().map(|&s| (s as f64) * (s as f64)).sum();
            if e < best_energy {
                best_energy = e;
                best = at + window / 2;
            }
            at += window / 2;
        }
        out.push((start, &samples[start..best]));
        start = best;
    }
    out
}

/// Cuenta la inactividad desde el final de la transcripción, no desde su inicio.
struct TouchOnDrop;

impl Drop for TouchOnDrop {
    fn drop(&mut self) {
        touch();
    }
}

/// Transcribe PCM de 16 kHz mono.
pub fn transcribe(pcm: &[i16]) -> Result<String, String> {
    let rec = recognizer()?;
    let _touch_after = TouchOnDrop;
    let samples: Vec<f32> = pcm.iter().map(|&s| s as f32 / 32768.0).collect();
    let mut text = String::new();
    for (_, chunk) in split_for_model(&samples, SAMPLE_RATE, MAX_CHUNK_SECONDS) {
        if chunk.len() < (SAMPLE_RATE as usize) / 4 {
            continue;
        }
        let stream = rec.create_stream();
        stream.accept_waveform(SAMPLE_RATE as i32, chunk);
        rec.decode(&stream);
        let Some(result) = stream.get_result() else { continue };
        let t = result.text.trim();
        if !t.is_empty() {
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(t);
        }
    }
    Ok(text)
}

// ── Comandos ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn model_status() -> ModelProgress {
    progress()
}

#[tauri::command]
pub fn download_model(app: AppHandle) {
    download(app);
}

#[tauri::command]
pub fn delete_model(app: AppHandle) -> Result<(), String> {
    let r = delete();
    emit_progress(&app);
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(rate: u32, seconds: f64) -> Vec<f32> {
        (0..(rate as f64 * seconds) as usize).map(|i| ((i as f32) * 0.05).sin() * 0.5).collect()
    }

    #[test]
    fn model_files_are_pinned() {
        assert_eq!(FILES.len(), 4);
        for f in FILES {
            assert!(
                f.url.starts_with("https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/2bda32ec70b097a55adaa07d9a7173915b43cc78/"),
                "{}",
                f.url
            );
            assert!(f.url.ends_with(f.name));
            assert_eq!(f.sha256.len(), 64);
        }
        assert!(model_dir().ends_with("LazoDesktop\\models\\parakeet-tdt-0.6b-v3-int8") || model_dir().ends_with("LazoDesktop/models/parakeet-tdt-0.6b-v3-int8"));
    }

    #[test]
    fn idle_unload_after_ten_minutes_of_no_use() {
        let t0 = Instant::now();
        let idle = Duration::from_secs(600);
        assert!(!should_unload(None, t0 + idle * 2, idle));
        assert!(!should_unload(Some(t0), t0 + Duration::from_secs(599), idle));
        assert!(should_unload(Some(t0), t0 + idle, idle));
        // Un uso más reciente reinicia la cuenta.
        let t1 = t0 + Duration::from_secs(500);
        assert!(!should_unload(Some(t1), t0 + idle, idle));
        assert!(!should_unload(Some(t1), t0, idle)); // reloj "atrás": no libera
        assert_eq!(IDLE_UNLOAD, Duration::from_secs(600));
    }

    #[test]
    fn pct_is_clamped() {
        assert_eq!(pct_of(0, 100), 0);
        assert_eq!(pct_of(50, 200), 25);
        assert_eq!(pct_of(300, 200), 100);
        assert_eq!(pct_of(5, 0), 0);
    }

    #[test]
    fn long_audio_is_cut_in_the_quiet() {
        let rate = 16_000;
        let mut samples = tone(rate, 25.0);
        samples.extend(vec![0.0; rate as usize]);
        samples.extend(tone(rate, 20.0));
        let parts = split_for_model(&samples, rate, 28.0);
        assert_eq!(parts.len(), 2);
        let cut = parts[1].0 as f64 / rate as f64;
        assert!((25.0..=26.0).contains(&cut), "cut at {cut}");
        assert_eq!(parts.iter().map(|p| p.1.len()).sum::<usize>(), samples.len());
        assert_eq!(split_for_model(&samples[..1000], rate, 28.0).len(), 1);
    }

    #[test]
    fn status_serializes_with_state_tag() {
        let j = serde_json::to_value(ModelStatus::Downloading { pct: 42 }).unwrap();
        assert_eq!(j, serde_json::json!({"state": "downloading", "pct": 42}));
        assert_eq!(serde_json::to_value(ModelStatus::Ready).unwrap(), serde_json::json!({"state": "ready"}));
    }
}
