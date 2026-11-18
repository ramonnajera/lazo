//! Requiere el modelo descargado en `%APPDATA%\LazoDesktop\models\parakeet-tdt-0.6b-v3-int8\`.
//! `cargo test -p lazo-desktop -- --ignored transcribes_sample_wav`
//! Por defecto usa `tests/fixtures/es-sample.wav` (voz sintética en español, Windows SAPI);
//! `LAZO_TEST_WAV=<ruta>` usa otro WAV PCM de 16 bits.

use lazo_desktop_lib::{asr, audio};

/// PCM 16 bits de un WAV (recorre los chunks: `fmt ` puede medir más de 16 bytes).
fn read_wav(bytes: &[u8]) -> (u32, u16, Vec<i16>) {
    assert_eq!(&bytes[0..4], b"RIFF");
    assert_eq!(&bytes[8..12], b"WAVE");
    let (mut rate, mut channels, mut pos) = (0u32, 1u16, 12usize);
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let len = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let body = &bytes[pos + 8..(pos + 8 + len).min(bytes.len())];
        if id == b"fmt " {
            channels = u16::from_le_bytes([body[2], body[3]]);
            rate = u32::from_le_bytes(body[4..8].try_into().unwrap());
            assert_eq!(u16::from_le_bytes([body[14], body[15]]), 16, "solo PCM de 16 bits");
        } else if id == b"data" {
            let pcm = body.as_chunks::<2>().0.iter().map(|b| i16::from_le_bytes(*b)).collect();
            return (rate, channels, pcm);
        }
        pos += 8 + len + (len & 1);
    }
    panic!("WAV sin chunk data");
}

#[test]
#[ignore]
fn transcribes_sample_wav() {
    let custom = std::env::var("LAZO_TEST_WAV").ok();
    let path = custom
        .clone()
        .unwrap_or_else(|| concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/es-sample.wav").to_string());
    let (rate, channels, pcm) = read_wav(&std::fs::read(&path).expect("WAV de prueba"));
    let pcm = if rate == audio::SAMPLE_RATE && channels == 1 {
        pcm
    } else {
        let f: Vec<f32> = pcm.iter().map(|&s| s as f32 / 32768.0).collect();
        let mono = audio::downmix_to_mono(&f, channels);
        audio::resample_linear(&mono, rate, audio::SAMPLE_RATE).iter().map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16).collect()
    };
    assert!(matches!(asr::status(), asr::ModelStatus::Ready), "modelo no descargado en {:?}", asr::model_dir());
    let started = std::time::Instant::now();
    let text = asr::transcribe(&pcm).expect("transcripción");
    println!("TRANSCRIPCIÓN ({:?}): {text}", started.elapsed());
    assert!(!text.is_empty());
    if custom.is_none() {
        // El fixture dice: "Recuérdame comprar leche mañana a las ocho de la mañana."
        let lower = text.to_lowercase();
        assert!(lower.contains("recuérdame") && lower.contains("leche") && lower.contains("mañana"), "{text}");
    }
}

/// Descarga real (~670 MB) con el mismo código que usa Configuración.
/// `cargo test -p lazo-desktop -- --ignored downloads_model`
#[test]
#[ignore]
fn downloads_model() {
    let mut last = 0u8;
    tauri::async_runtime::block_on(asr::download_files(|pct| {
        if pct >= last + 10 {
            last = pct;
            println!("descarga {pct} %");
        }
    }))
    .expect("descarga");
    assert!(matches!(asr::status(), asr::ModelStatus::Ready));
}

/// Graba 1 s del micrófono predeterminado (sin micrófono debe fallar con "Sin acceso al micrófono").
/// `cargo test -p lazo-desktop -- --ignored records_from_microphone --nocapture`
#[test]
#[ignore]
fn records_from_microphone() {
    println!("micrófonos: {:?}", audio::microphone_names());
    match audio::Recorder::start(None) {
        Ok(rec) => {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let level = rec.level();
            let pcm = rec.stop();
            println!("{} muestras, nivel {level}", pcm.len());
            assert!((15_000..=17_000).contains(&pcm.len()), "{}", pcm.len());
        }
        Err(e) => {
            println!("{e}: {}", e.detail);
            assert_eq!(e.to_string(), audio::MIC_ERROR);
        }
    }
}
