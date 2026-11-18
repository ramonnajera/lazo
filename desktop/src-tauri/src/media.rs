// Adapted from coucou (https://github.com/Louis-CFM/coucou), MIT License, Copyright (c) Louis Raillé
//
// Controles multimedia del sistema (GlobalSystemMediaTransportControls), generalizados a cualquier
// reproductor. Un hilo propio hace las llamadas WinRT (`.join()` bloquea) y atiende los pedidos de
// los comandos; los eventos de WinRT solo despiertan ese hilo, que lee el estado y emite
// `media-changed`. La posición no genera eventos propios: se lee con cada cambio y la interfaz la
// avanza sola mientras suena.

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use lazo_core::commands::MediaOp;
use lazo_core::config::Config;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Portada máxima que viaja en el evento (data URL); más grande se omite.
const THUMBNAIL_LIMIT: u64 = 200 * 1024;
/// Desvío de posición que justifica un evento nuevo si lo demás no cambió.
const POSITION_DRIFT_MS: u64 = 2_000;
/// Espera para agrupar ráfagas de eventos (una pista nueva mueve todo a la vez).
const COALESCE: Duration = Duration::from_millis(150);
/// Tiempo máximo que espera una orden a que el hilo de medios responda.
const REPLY_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub app: String,
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    /// Data URL de la portada, si hay y es de tamaño razonable.
    pub thumbnail: Option<String>,
}

// ── Lógica pura (con pruebas) ───────────────────────────────────────────────────

/// Duraciones y posiciones de Windows: ticks de 100 ns → milisegundos.
pub fn ticks_to_ms(ticks: i64) -> u64 {
    ticks.max(0) as u64 / 10_000
}

/// Windows DateTime (ticks de 100 ns desde 1601) → ms Unix. Cero es "nunca actualizado".
pub fn windows_time_to_unix_ms(universal: i64) -> Option<i64> {
    const UNIX_EPOCH_TICKS: i64 = 116_444_736_000_000_000;
    (universal > 0).then(|| (universal - UNIX_EPOCH_TICKS) / 10_000)
}

/// La posición que Windows informa era cierta en `updated_ms`; si suena, avanza hasta `now_ms`.
pub fn live_position(position_ms: u64, updated_ms: Option<i64>, now_ms: i64, playing: bool, duration_ms: u64) -> u64 {
    let mut pos = position_ms;
    if playing {
        if let Some(t) = updated_ms {
            pos += (now_ms - t).max(0) as u64;
        }
    }
    if duration_ms > 0 { pos.min(duration_ms) } else { pos }
}

/// Índice de la sesión elegida: la de la app preferida (sin distinguir mayúsculas, por contenido del
/// id) o `None` para que se use la actual del sistema.
pub fn pick_session(ids: &[String], preferred: Option<&str>) -> Option<usize> {
    let want = preferred?.trim().to_ascii_lowercase();
    if want.is_empty() {
        return None;
    }
    ids.iter().position(|id| id.to_ascii_lowercase() == want).or_else(|| ids.iter().position(|id| id.to_ascii_lowercase().contains(&want)))
}

/// ¿Vale la pena avisar a la interfaz? Sí si algo distinto de la posición cambió, o si la posición
/// se desvió de lo que la interfaz ya estaría mostrando (salto, no avance normal).
pub fn should_emit(prev: Option<&MediaState>, next: Option<&MediaState>, elapsed_ms: u64) -> bool {
    match (prev, next) {
        (None, None) => false,
        (Some(a), Some(b)) => {
            if a.app != b.app
                || a.title != b.title
                || a.artist != b.artist
                || a.playing != b.playing
                || a.duration_ms != b.duration_ms
                || a.thumbnail != b.thumbnail
            {
                return true;
            }
            let expected = a.position_ms + if a.playing { elapsed_ms } else { 0 };
            expected.abs_diff(b.position_ms) > POSITION_DRIFT_MS
        }
        _ => true,
    }
}

/// Tipo de imagen por sus primeros bytes, nunca por lo que el reproductor diga.
pub fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else {
        None
    }
}

pub fn data_url(bytes: &[u8]) -> Option<String> {
    use base64::Engine;
    let mime = sniff_image(bytes)?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

// ── Hilo de medios ──────────────────────────────────────────────────────────────

enum Msg {
    /// Algo de la sesión cambió: releer.
    Changed,
    /// Cambió la lista de sesiones o la app preferida: volver a elegir.
    Sessions,
    Control(MediaOp, Sender<Result<bool, String>>),
    Seek(u64, Sender<Result<bool, String>>),
    List(Sender<Vec<String>>),
}

static TX: OnceLock<Mutex<Sender<Msg>>> = OnceLock::new();
/// Última lectura y el instante Unix (ms) en que se hizo; `media_state` avanza la posición desde ahí.
static LAST: Mutex<Option<(MediaState, i64)>> = Mutex::new(None);
/// Último estado que se avisó a la interfaz y cuándo (Unix ms): contra él se decide si emitir.
static EMITTED: Mutex<Option<(MediaState, i64)>> = Mutex::new(None);

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn send(msg: Msg) -> bool {
    TX.get().is_some_and(|tx| tx.lock().unwrap_or_else(|e| e.into_inner()).send(msg).is_ok())
}

/// Arranca el hilo y vigila la configuración (la app preferida cambia la sesión elegida).
pub fn start(app: &AppHandle) {
    let (tx, rx) = mpsc::channel();
    let _ = TX.set(Mutex::new(tx));
    let handle = app.clone();
    let _ = std::thread::Builder::new().name("lazo-media".into()).spawn(move || {
        #[cfg(windows)]
        win::run(handle, rx);
        #[cfg(not(windows))]
        let _ = (handle, rx);
    });
}

pub fn config_changed() {
    send(Msg::Sessions);
}

/// Para `exec`: manda la orden a la sesión elegida. `Ok(true)` hecha; `Ok(false)` solo si no hay
/// hilo de medios ni sesión (quien llama puede usar las teclas de medios); si la sesión la
/// rechaza, `Err` (las teclas alternarían y "pausa" podría iniciar la reproducción).
pub fn try_control(op: MediaOp) -> Result<bool, String> {
    let (tx, rx) = mpsc::channel();
    if !send(Msg::Control(op, tx)) {
        return Ok(false);
    }
    rx.recv_timeout(REPLY_TIMEOUT).map_err(|_| "El reproductor no respondió".to_string())?
}

#[tauri::command]
pub fn media_state() -> Option<MediaState> {
    let (mut st, read_at) = LAST.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
    st.position_ms = live_position(st.position_ms, Some(read_at), now_ms(), st.playing, st.duration_ms);
    Some(st)
}

#[tauri::command]
pub async fn media_control(op: MediaOp) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || try_control(op))
        .await
        .map_err(|e| e.to_string())?
        .and_then(|ok| if ok { Ok(()) } else { Err("No hay un reproductor activo".into()) })
}

#[tauri::command]
pub async fn media_seek(position_ms: u64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tx, rx) = mpsc::channel();
        if !send(Msg::Seek(position_ms, tx)) {
            return Err("No hay un reproductor activo".to_string());
        }
        rx.recv_timeout(REPLY_TIMEOUT).map_err(|_| "El reproductor no respondió".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
    .and_then(|ok| if ok { Ok(()) } else { Err("El reproductor no permite saltar".into()) })
}

/// Aplicaciones con una sesión de medios ahora (para elegir la preferida).
#[tauri::command]
pub async fn media_sessions() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (tx, rx) = mpsc::channel();
        if !send(Msg::List(tx)) {
            return Vec::new();
        }
        rx.recv_timeout(REPLY_TIMEOUT).unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

fn preferred_app(app: &AppHandle) -> Option<String> {
    let state = app.try_state::<Mutex<Config>>()?;
    let cfg = state.lock().unwrap_or_else(|e| e.into_inner());
    cfg.music.preferred_app.clone()
}

fn publish(app: &AppHandle, next: Option<MediaState>) {
    let now = now_ms();
    *LAST.lock().unwrap_or_else(|e| e.into_inner()) = next.clone().map(|s| (s, now));
    let mut emitted = EMITTED.lock().unwrap_or_else(|e| e.into_inner());
    let (prev, at) = match emitted.as_ref() {
        Some((s, at)) => (Some(s), *at),
        None => (None, now),
    };
    if should_emit(prev, next.as_ref(), (now - at).max(0) as u64) {
        *emitted = next.clone().map(|s| (s, now));
        let _ = app.emit("media-changed", next);
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use windows::Foundation::TypedEventHandler;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionMediaProperties as Props,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::DataReader;
    use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};

    struct Bound {
        session: Session,
        tokens: [Option<i64>; 3],
    }

    impl Bound {
        fn bind(session: Session, tx: &Sender<Msg>) -> Bound {
            let tokens = [
                session.MediaPropertiesChanged(&wake(tx)).ok(),
                session.PlaybackInfoChanged(&wake(tx)).ok(),
                session.TimelinePropertiesChanged(&wake(tx)).ok(),
            ];
            Bound { session, tokens }
        }

        fn unbind(self) {
            let [media, playback, timeline] = self.tokens;
            if let Some(t) = media {
                let _ = self.session.RemoveMediaPropertiesChanged(t);
            }
            if let Some(t) = playback {
                let _ = self.session.RemovePlaybackInfoChanged(t);
            }
            if let Some(t) = timeline {
                let _ = self.session.RemoveTimelinePropertiesChanged(t);
            }
        }
    }

    /// Manejador que solo despierta al hilo (los de WinRT corren en hilos ajenos).
    fn wake<A: windows::core::RuntimeType + 'static>(tx: &Sender<Msg>) -> TypedEventHandler<Session, A> {
        let tx = tx.clone();
        TypedEventHandler::new(move |_, _| {
            let _ = tx.send(Msg::Changed);
            Ok(())
        })
    }

    fn session_ids(manager: &Manager) -> Vec<(String, Session)> {
        let Ok(list) = manager.GetSessions() else { return Vec::new() };
        let n = list.Size().unwrap_or(0);
        (0..n)
            .filter_map(|i| list.GetAt(i).ok())
            .filter_map(|s| s.SourceAppUserModelId().ok().map(|id| (id.to_string_lossy(), s)))
            .collect()
    }

    fn choose(manager: &Manager, preferred: Option<&str>) -> Option<Session> {
        let all = session_ids(manager);
        let ids: Vec<String> = all.iter().map(|(id, _)| id.clone()).collect();
        if let Some(i) = pick_session(&ids, preferred) {
            return all.into_iter().nth(i).map(|(_, s)| s);
        }
        manager.GetCurrentSession().ok()
    }

    fn thumbnail(props: &Props) -> Option<String> {
        let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.join().ok()?;
        let size = stream.Size().ok()?;
        if size == 0 || size > THUMBNAIL_LIMIT {
            return None;
        }
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        let loaded = reader.LoadAsync(size as u32).ok()?.join().ok()?;
        let mut bytes = vec![0u8; loaded as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        data_url(&bytes)
    }

    /// Cubre la portada de la pista en curso: se lee una vez por pista.
    #[derive(Default)]
    struct Cover {
        key: String,
        data: Option<String>,
        /// Intentos de leer la portada de esta pista (un fallo no se repite sin fin).
        tries: u8,
    }

    fn read(session: &Session, cover: &mut Cover) -> Option<MediaState> {
        let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
        let title = props.Title().ok()?.to_string_lossy();
        let artist = props.Artist().map(|a| a.to_string_lossy()).unwrap_or_default();
        if title.trim().is_empty() && artist.trim().is_empty() {
            return None;
        }
        let app = session.SourceAppUserModelId().map(|a| a.to_string_lossy()).unwrap_or_default();
        let timeline = session.GetTimelineProperties().ok()?;
        let start = timeline.StartTime().map(|t| t.Duration).unwrap_or(0);
        let duration_ms = ticks_to_ms(timeline.EndTime().map(|t| t.Duration).unwrap_or(0) - start);
        let position_raw = ticks_to_ms(timeline.Position().map(|t| t.Duration).unwrap_or(0) - start);
        let updated = timeline.LastUpdatedTime().ok().and_then(|t| windows_time_to_unix_ms(t.UniversalTime));
        let playing = session
            .GetPlaybackInfo()
            .and_then(|i| i.PlaybackStatus())
            .is_ok_and(|s| s == Status::Playing);

        let key = format!("{app}\u{1f}{title}\u{1f}{artist}");
        if cover.key != key {
            *cover = Cover { key, data: None, tries: 0 };
        }
        if cover.data.is_none() && cover.tries < 3 {
            // Algunos reproductores publican la portada un instante después del título.
            cover.tries += 1;
            cover.data = thumbnail(&props);
        }
        Some(MediaState {
            app,
            title,
            artist,
            playing,
            position_ms: live_position(position_raw, updated, now_ms(), playing, duration_ms),
            duration_ms,
            thumbnail: cover.data.clone(),
        })
    }

    /// Pide a Windows y espera si el reproductor aceptó.
    macro_rules! ok {
        ($op:expr) => {
            match $op.and_then(|o| o.join()) {
                Ok(true) => Ok(true),
                Ok(false) => Err("El reproductor no aceptó la orden".to_string()),
                Err(e) => Err(e.to_string()),
            }
        };
    }

    pub fn run(app: AppHandle, rx: Receiver<Msg>) {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let tx = match TX.get() {
            Some(t) => t.lock().unwrap_or_else(|e| e.into_inner()).clone(),
            None => return,
        };
        let manager = match Manager::RequestAsync().and_then(|o| o.join()) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("media: sin sesiones de medios: {e}");
                return;
            }
        };
        let sessions_token = {
            let tx = tx.clone();
            manager
                .SessionsChanged(&TypedEventHandler::new(move |_, _| {
                    let _ = tx.send(Msg::Sessions);
                    Ok(())
                }))
                .ok()
        };
        // La sesión "actual" también cambia sin que cambie la lista.
        let current_token = {
            let tx = tx.clone();
            manager
                .CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
                    let _ = tx.send(Msg::Sessions);
                    Ok(())
                }))
                .ok()
        };

        let mut bound: Option<Bound> = None;
        let mut rebind = true;
        let mut cover = Cover::default();
        loop {
            if rebind {
                if let Some(b) = bound.take() {
                    b.unbind();
                }
                bound = choose(&manager, preferred_app(&app).as_deref()).map(|s| Bound::bind(s, &tx));
                rebind = false;
            }
            let next = bound.as_ref().and_then(|b| read(&b.session, &mut cover));
            publish(&app, next);

            // Espera algo que hacer y agrupa la ráfaga que lo acompaña.
            let mut pending = Vec::new();
            match rx.recv() {
                Ok(m) => pending.push(m),
                Err(_) => break,
            }
            std::thread::sleep(COALESCE);
            while let Ok(m) = rx.try_recv() {
                pending.push(m);
            }
            for m in pending {
                match m {
                    Msg::Changed => {}
                    Msg::Sessions => rebind = true,
                    Msg::List(reply) => {
                        let _ = reply.send(session_ids(&manager).into_iter().map(|(id, _)| id).collect());
                    }
                    Msg::Control(op, reply) => {
                        let r = match bound.as_ref().map(|b| &b.session) {
                            None => Ok(false),
                            Some(s) => match op {
                                MediaOp::PlayPause => ok!(s.TryTogglePlayPauseAsync()),
                                MediaOp::Play => ok!(s.TryPlayAsync()),
                                MediaOp::Pause => ok!(s.TryPauseAsync()),
                                MediaOp::Next => ok!(s.TrySkipNextAsync()),
                                MediaOp::Previous => ok!(s.TrySkipPreviousAsync()),
                            },
                        };
                        let _ = reply.send(r);
                    }
                    Msg::Seek(ms, reply) => {
                        let r = match bound.as_ref().map(|b| &b.session) {
                            None => Ok(false),
                            Some(s) => {
                                let start = s.GetTimelineProperties().and_then(|t| t.StartTime()).map(|t| t.Duration).unwrap_or(0);
                                ok!(s.TryChangePlaybackPositionAsync(start + ms as i64 * 10_000))
                            }
                        };
                        let _ = reply.send(r);
                    }
                }
            }
        }

        if let Some(b) = bound {
            b.unbind();
        }
        if let Some(t) = sessions_token {
            let _ = manager.RemoveSessionsChanged(t);
        }
        if let Some(t) = current_token {
            let _ = manager.RemoveCurrentSessionChanged(t);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st(title: &str, playing: bool, pos: u64) -> MediaState {
        MediaState { app: "Spotify.exe".into(), title: title.into(), artist: "A".into(), playing, position_ms: pos, duration_ms: 200_000, thumbnail: None }
    }

    #[test]
    fn ticks_and_epoch() {
        assert_eq!(ticks_to_ms(10_000_000), 1000);
        assert_eq!(ticks_to_ms(-5), 0);
        assert_eq!(windows_time_to_unix_ms(0), None);
        assert_eq!(windows_time_to_unix_ms(116_444_736_000_000_000 + 10_000), Some(1));
    }

    #[test]
    fn position_runs_on_only_while_playing_and_caps_at_duration() {
        assert_eq!(live_position(10_000, Some(1_000), 4_000, true, 100_000), 13_000);
        assert_eq!(live_position(10_000, Some(1_000), 4_000, false, 100_000), 10_000);
        assert_eq!(live_position(10_000, None, 4_000, true, 100_000), 10_000);
        assert_eq!(live_position(99_000, Some(0), 5_000, true, 100_000), 100_000);
        assert_eq!(live_position(99_000, Some(0), 5_000, true, 0), 104_000);
    }

    #[test]
    fn picks_preferred_session_else_none() {
        let ids = vec!["chrome.exe".to_string(), "Spotify.exe".to_string()];
        assert_eq!(pick_session(&ids, Some("spotify.exe")), Some(1));
        assert_eq!(pick_session(&ids, Some("spotify")), Some(1));
        assert_eq!(pick_session(&ids, Some("vlc")), None);
        assert_eq!(pick_session(&ids, None), None);
        assert_eq!(pick_session(&ids, Some("  ")), None);
    }

    #[test]
    fn emits_on_change_but_not_on_normal_progress() {
        let a = st("x", true, 10_000);
        assert!(!should_emit(Some(&a), Some(&st("x", true, 11_000)), 1_000));
        assert!(should_emit(Some(&a), Some(&st("x", true, 60_000)), 1_000), "salto");
        assert!(should_emit(Some(&a), Some(&st("y", true, 10_000)), 0));
        assert!(should_emit(Some(&a), Some(&st("x", false, 10_000)), 0));
        assert!(should_emit(None, Some(&a), 0));
        assert!(should_emit(Some(&a), None, 0));
        assert!(!should_emit(None, None, 0));
    }

    #[test]
    fn data_url_sniffs_the_bytes() {
        assert_eq!(sniff_image(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(sniff_image(b"nada"), None);
        assert!(data_url(b"\x89PNG\r\n\x1a\n....").unwrap().starts_with("data:image/png;base64,"));
        assert!(data_url(b"texto").is_none());
    }

    #[test]
    fn state_serializes_camel_case() {
        let v = serde_json::to_value(st("x", true, 5)).unwrap();
        assert_eq!(v["positionMs"], 5);
        assert_eq!(v["durationMs"], 200_000);
    }
}
