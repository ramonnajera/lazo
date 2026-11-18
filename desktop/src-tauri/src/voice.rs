//! Hilo de voz: recibe las acciones de las teclas globales, graba, transcribe y pega.
//!
//! Dictado: `audio` → `asr` → `apply_dictation` → `paste_text` (transcribir y pegar van en un
//! solo hilo, en orden de llegada). Lazo: `audio` → `asr` → `parse` → [`route`]: orden local
//! (`exec`), "No encontré «X»", `POST /message`, o `POST /voice` si no hay modelo local.
//! A la isla le emite `listen-state {id, mode, phase, level?, text?, action?, heard?, reply?}`
//! y `power-confirm {id, cmd, text}` antes de suspender o apagar.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use lazo_core::commands::{Command, ParseResult, TargetKind, parse};
use lazo_core::config::Config;
use lazo_core::dictation::apply_dictation;
use lazo_core::hotkey::{Action, Mode};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::api::{self, ApiError, ApiErrorKind};
use crate::asr::{self, ModelStatus};
use crate::audio::{MIC_ERROR, Recorder};
use crate::{exec, keyboard_hook, paste, tray, window::ISLAND};

const LEVEL_EVERY: Duration = Duration::from_millis(50);
const POLL: Duration = Duration::from_millis(20);
/// Una confirmación de suspender/apagar vale este tiempo.
const CONFIRM_TTL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModeName {
    Dictation,
    Lazo,
}

impl From<Mode> for ModeName {
    fn from(m: Mode) -> Self {
        match m {
            Mode::Dictation => ModeName::Dictation,
            Mode::Lazo => ModeName::Lazo,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Recording,
    Processing,
    /// Esperando la respuesta de Lazo (no bloquea el dictado).
    Thinking,
    Done,
    Error,
}

/// Qué ofrece la isla junto a un error o un aviso.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ErrorAction {
    /// Abrir `ms-settings:privacy-microphone`.
    Mic,
    /// Abrir Configuración → Voz y modelo para descargar Parakeet.
    Model,
    /// Abrir Configuración → Órdenes (alias que no existe).
    Commands,
    /// Abrir Configuración → Conexión (falta el token o es inválido).
    Connection,
    /// El dictado no se pudo pegar ni escribir: `text` es lo dictado, con botón para copiarlo.
    Copy,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Extra {
    /// Lo que se le dijo a Lazo (para el historial del chat).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heard: Option<String>,
    /// `text` es la respuesta de Lazo: la isla la muestra 8 s y recarga los paneles.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub reply: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenState {
    pub id: u64,
    pub mode: ModeName,
    pub phase: Phase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<ErrorAction>,
    #[serde(flatten)]
    pub extra: Extra,
}

fn emit_x(app: &AppHandle, id: u64, mode: Mode, phase: Phase, text: Option<String>, action: Option<ErrorAction>, extra: Extra) {
    let s = ListenState { id, mode: mode.into(), phase, level: None, text, action, extra };
    let _ = app.emit_to(ISLAND, "listen-state", s);
}

fn emit(app: &AppHandle, id: u64, mode: Mode, phase: Phase, text: Option<String>, action: Option<ErrorAction>) {
    emit_x(app, id, mode, phase, text, action, Extra::default());
}

struct Session {
    id: u64,
    mode: Mode,
    /// Abierta desde el botón de micrófono del chat: el micrófono se abre ya, sin esperar tecla.
    ui: bool,
    /// `None` hasta que la tecla lleva [`lazo_core::hotkey::MIC_HOLD_MS`] abajo (o manos
    /// libres): AltGr+Q o RCtrl+C nunca abren el micrófono (los audífonos Bluetooth no
    /// cambian a modo llamada ni parpadea el ícono del micrófono).
    rec: Option<Recorder>,
    last_level: Instant,
}

/// Una grabación terminada, en la cola de transcribir + pegar.
struct Job {
    id: u64,
    mode: Mode,
    pcm: Vec<i16>,
    cfg: Config,
}

struct Worker {
    app: AppHandle,
    session: Option<Session>,
    next_id: u64,
    jobs: Sender<Job>,
}

/// Botón de micrófono del chat → hilo de voz.
static UI_MIC: OnceLock<Mutex<Sender<bool>>> = OnceLock::new();

/// Sleep/Shutdown esperando el "Sí" de la isla.
static PENDING_POWER: Mutex<Option<(Command, Instant)>> = Mutex::new(None);

/// Arranca el hilo de voz con las acciones del gancho de teclado, y el hilo que transcribe y
/// pega de a una grabación, en orden (cada restauración ve el portapapeles original).
pub fn spawn(app: AppHandle, rx: Receiver<Action>) {
    let (jobs, queue) = mpsc::channel::<Job>();
    let (ui_tx, ui_rx) = mpsc::channel::<bool>();
    let _ = UI_MIC.set(Mutex::new(ui_tx));
    let a = app.clone();
    let _ = std::thread::Builder::new().name("lazo-transcribe".into()).spawn(move || {
        for job in queue {
            let (id, mode) = (job.id, job.mode);
            // Un pánico en una grabación no tumba el hilo: las siguientes siguen funcionando.
            if catch_unwind(AssertUnwindSafe(|| process(&a, job))).is_err() {
                eprintln!("voice: pánico al procesar la grabación {id}");
                emit(&a, id, mode, Phase::Error, Some("Algo falló al procesar la voz".into()), None);
            }
        }
    });
    let _ = std::thread::Builder::new().name("lazo-voice".into()).spawn(move || {
        let mut w = Worker { app, session: None, next_id: 1, jobs };
        loop {
            match rx.recv_timeout(POLL) {
                Ok(a) => w.on_action(a),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            while let Ok(on) = ui_rx.try_recv() {
                w.on_ui_mic(on);
            }
            let a = keyboard_hook::tick();
            if a != Action::None {
                w.on_action(a);
            }
            w.poll();
        }
    });
}

/// Transcribir bloquea: corre aquí, nunca en el hilo del gancho ni en el de voz.
fn process(app: &AppHandle, job: Job) {
    match job.mode {
        Mode::Dictation => match asr::transcribe(&job.pcm) {
            Ok(text) => on_dictation_text(app, job.id, &text, &job.cfg),
            Err(e) => emit(app, job.id, job.mode, Phase::Error, Some(e), None),
        },
        Mode::Lazo => on_lazo_audio(app, job),
    }
}

impl Worker {
    fn config(&self) -> Config {
        self.app.state::<Mutex<Config>>().lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Recibe una acción de la máquina de teclas.
    fn on_action(&mut self, action: Action) {
        match action {
            Action::Start(mode) => self.start(mode, false),
            Action::Stop(mode) => self.stop(mode),
            Action::Cancel => self.cancel(),
            Action::None => {}
        }
    }

    /// Botón de micrófono del chat: primer clic empieza a escuchar a Lazo, el segundo termina.
    fn on_ui_mic(&mut self, on: bool) {
        match (on, self.session.as_ref()) {
            (true, None) => self.start(Mode::Lazo, true),
            (false, Some(s)) if s.mode == Mode::Lazo => self.stop(Mode::Lazo),
            _ => {}
        }
    }

    fn fail(&mut self, id: u64, mode: Mode, text: &str, action: Option<ErrorAction>) {
        self.session = None;
        keyboard_hook::reset();
        emit(&self.app, id, mode, Phase::Error, Some(text.into()), action);
    }

    /// Solo anota la sesión: el micrófono se abre en `poll` si la tecla sigue abajo.
    fn start(&mut self, mode: Mode, ui: bool) {
        if self.session.is_some() {
            return;
        }
        if tray::get_paused(self.app.clone()) {
            keyboard_hook::reset();
            return;
        }
        let id = self.next_id;
        self.next_id += 1;
        self.session = Some(Session { id, mode, ui, rec: None, last_level: Instant::now() });
        if ui {
            self.open_mic();
        }
    }

    fn open_mic(&mut self) {
        let Some(s) = self.session.as_ref() else { return };
        let (id, mode) = (s.id, s.mode);
        // Sin modelo, la tecla de Lazo manda el audio a /voice; el dictado lo necesita.
        match (asr::status(), mode) {
            (ModelStatus::Ready, _) => {
                // El modelo carga mientras el usuario habla (no hace nada si ya está).
                asr::preload();
            }
            (_, Mode::Lazo) => {}
            (ModelStatus::Downloading { pct }, Mode::Dictation) => {
                let msg = format!("El modelo de voz se está descargando ({pct} %)");
                return self.fail(id, mode, &msg, Some(ErrorAction::Model));
            }
            (ModelStatus::Missing, Mode::Dictation) => {
                return self.fail(id, mode, "Falta el modelo de voz: descárgalo", Some(ErrorAction::Model));
            }
        }
        let mic = self.config().voice.microphone;
        match Recorder::start(mic.as_deref()) {
            Ok(rec) => {
                if let Some(s) = self.session.as_mut() {
                    s.rec = Some(rec);
                    s.last_level = Instant::now();
                }
                emit(&self.app, id, mode, Phase::Recording, None, None);
            }
            Err(e) => {
                eprintln!("voice: micrófono: {}", e.detail);
                self.fail(id, mode, MIC_ERROR, Some(ErrorAction::Mic));
            }
        }
    }

    fn cancel(&mut self) {
        if let Some(s) = self.session.take() {
            // Sin micrófono abierto no se mostró nada: no hay nada que cerrar en la isla.
            if s.rec.is_some() {
                emit(&self.app, s.id, s.mode, Phase::Done, None, None);
            }
        }
    }

    fn stop(&mut self, mode: Mode) {
        let Some(s) = self.session.take() else { return };
        if s.mode != mode {
            self.session = Some(s);
            return;
        }
        // Soltó antes de abrir el micrófono: un toque o un atajo, nada que transcribir.
        let Some(rec) = s.rec else { return };
        emit(&self.app, s.id, mode, Phase::Processing, None, None);
        let pcm = rec.stop();
        if self.jobs.send(Job { id: s.id, mode, pcm, cfg: self.config() }).is_err() {
            eprintln!("voice: la cola de transcripción está cerrada");
            emit(&self.app, s.id, mode, Phase::Error, Some("Algo falló al procesar la voz".into()), None);
        }
    }

    fn poll(&mut self) {
        let Some(s) = self.session.as_mut() else { return };
        let Some(rec) = s.rec.as_ref() else {
            if !s.ui && keyboard_hook::should_open_mic() {
                self.open_mic();
            }
            return;
        };
        if s.last_level.elapsed() >= LEVEL_EVERY {
            s.last_level = Instant::now();
            let st = ListenState {
                id: s.id,
                mode: s.mode.into(),
                phase: Phase::Recording,
                level: Some(rec.level()),
                text: None,
                action: None,
                extra: Extra::default(),
            };
            let _ = self.app.emit_to(ISLAND, "listen-state", st);
        }
        // Tope de 120 s: la grabación termina sola como si se soltara la tecla.
        if rec.is_full() {
            let mode = s.mode;
            keyboard_hook::reset();
            self.stop(mode);
        }
    }
}

fn on_dictation_text(app: &AppHandle, id: u64, raw: &str, cfg: &Config) {
    let text = apply_dictation(raw, &cfg.dictation);
    // Texto vacío: no se pega nada.
    if text.is_empty() {
        return emit(app, id, Mode::Dictation, Phase::Done, None, None);
    }
    match paste::paste_text(&text, cfg.dictation.restore_clipboard) {
        Ok(()) => emit(app, id, Mode::Dictation, Phase::Done, Some(text), None),
        // Ni portapapeles ni teclas: el texto no se pierde, la isla lo muestra para copiarlo.
        Err(e) => {
            eprintln!("voice: no se pudo pegar el dictado: {e}");
            emit(app, id, Mode::Dictation, Phase::Error, Some(text), Some(ErrorAction::Copy))
        }
    }
}

/// Botón «Copiar» de un dictado que no se pudo pegar.
#[tauri::command]
pub async fn copy_text(text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || paste::copy_text(&text)).await.map_err(|e| e.to_string())?
}

/// Grabación para Lazo: con modelo, transcribe aquí y decide; sin modelo, todo a `/voice`.
fn on_lazo_audio(app: &AppHandle, job: Job) {
    let ready = asr::status() == ModelStatus::Ready;
    let (text, result) = if ready {
        match asr::transcribe(&job.pcm) {
            Ok(t) => {
                let t = t.trim().to_string();
                let r = parse(&t, &job.cfg.commands);
                (t, Some(r))
            }
            Err(e) => {
                // El modelo no cargó: Lazo todavía puede entender el audio.
                eprintln!("voice: transcribir: {e}; se usa /voice");
                (String::new(), None)
            }
        }
    } else {
        (String::new(), None)
    };
    let ready = result.is_some();
    match route(result.unwrap_or(ParseResult::NotACommand), ready) {
        Route::SendText if text.is_empty() => emit(app, job.id, Mode::Lazo, Phase::Done, None, None),
        Route::NoModel => no_model(app, job.id),
        r => run_route(app, job.id, r, &text, &job.cfg),
    }
}

/// Ejecuta una decisión ya tomada para el texto `text`.
fn run_route(app: &AppHandle, id: u64, r: Route, text: &str, cfg: &Config) {
    match r {
        Route::Exec(cmd) => run_command(app, id, cmd, cfg),
        Route::AskAdd(_, target) => emit(
            app,
            id,
            Mode::Lazo,
            Phase::Done,
            Some(format!("No encontré «{target}». ¿Lo agrego en Órdenes?")),
            Some(ErrorAction::Commands),
        ),
        Route::SendText => ask_lazo(app, id, text.to_string(), cfg.connection.api_url.clone()),
        Route::NoModel => no_model(app, id),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PowerConfirm {
    id: u64,
    cmd: Command,
    text: &'static str,
}

fn run_command(app: &AppHandle, id: u64, cmd: Command, cfg: &Config) {
    if exec::needs_confirm(&cmd, &cfg.commands) {
        *PENDING_POWER.lock().unwrap_or_else(|e| e.into_inner()) = Some((cmd.clone(), Instant::now()));
        let text = exec::confirm_question(&cmd);
        let _ = app.emit_to(ISLAND, "power-confirm", PowerConfirm { id, cmd, text });
        return;
    }
    match exec::run(&cmd) {
        Ok(t) => {
            let t = match cmd {
                Command::OpenUrl(_) | Command::OpenProgram(_) | Command::OpenFolder(_) => exec::label(&cmd, Some(&cfg.commands)),
                _ => t,
            };
            emit(app, id, Mode::Lazo, Phase::Done, Some(t), None)
        }
        Err(e) => emit(app, id, Mode::Lazo, Phase::Error, Some(e), None),
    }
}

/// Sin el modelo de voz local no se manda el audio a ningún servicio de internet: se pide descargarlo.
fn no_model(app: &AppHandle, id: u64) {
    emit(app, id, Mode::Lazo, Phase::Error, Some("Falta el modelo de voz. Descárgalo en Configuración → Voz y modelo.".into()), Some(ErrorAction::Model));
}

/// Mensaje de error de la isla para un fallo de la API.
pub fn api_error_text(e: &ApiError) -> (String, Option<ErrorAction>) {
    match e.kind {
        ApiErrorKind::Offline => ("Sin conexión con Lazo".into(), None),
        ApiErrorKind::NoToken => ("Falta el token de Lazo".into(), Some(ErrorAction::Connection)),
        ApiErrorKind::Unauthorized => ("Token de Lazo inválido".into(), Some(ErrorAction::Connection)),
        ApiErrorKind::Http => (format!("Lazo no pudo responder: {}", e.message), None),
    }
}

/// Pregunta a Lazo sin bloquear la cola de voz: la isla muestra "Lazo está pensando…".
fn ask_lazo(app: &AppHandle, id: u64, text: String, base: String) {
    let heard = Some(text.clone());
    emit_x(app, id, Mode::Lazo, Phase::Thinking, None, None, Extra { heard: heard.clone(), reply: false });
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // El servidor de Lazo entiende la frase en español («ya la tomé», «qué sigue»…) y contesta con `reply`.
        let r = api::request_json(&base, "POST", "/voz", Some(serde_json::json!({ "texto": text }))).await;
        match r {
            Ok(v) => {
                let (heard2, reply) = reply_of(&v);
                let heard = heard.or(heard2);
                emit_x(&app, id, Mode::Lazo, Phase::Done, Some(reply), None, Extra { heard, reply: true });
            }
            Err(e) => {
                let (msg, action) = api_error_text(&e);
                emit_x(&app, id, Mode::Lazo, Phase::Error, Some(msg), action, Extra { heard, reply: false });
            }
        }
    });
}

/// `{reply}` de `/voz`.
pub fn reply_of(v: &Value) -> (Option<String>, String) {
    let heard = v.get("transcript").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let reply = v.get("reply").and_then(Value::as_str).map(str::trim).unwrap_or("");
    (heard, if reply.is_empty() { "Lazo no respondió nada".into() } else { reply.to_string() })
}

/// A dónde va lo que se le dijo a Lazo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    Exec(Command),
    AskAdd(TargetKind, String),
    SendText,
    NoModel,
}

/// Decisión pura: sin modelo listo no se procesa el audio; un `NotFound` nunca va a Lazo.
pub fn route(result: ParseResult, model_ready: bool) -> Route {
    if !model_ready {
        return Route::NoModel;
    }
    match result {
        ParseResult::Command(c) => Route::Exec(c),
        ParseResult::NotFound { kind, target } => Route::AskAdd(kind, target),
        ParseResult::NotACommand => Route::SendText,
    }
}

/// Botón "Abrir permisos" de la isla tras "Sin acceso al micrófono".
#[tauri::command]
pub fn open_mic_privacy(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url("ms-settings:privacy-microphone", None::<&str>).map_err(|e| e.to_string())
}

/// Botón de micrófono del chat: `on` empieza a escuchar a Lazo, `!on` termina y envía.
#[tauri::command]
pub fn lazo_mic(on: bool) -> Result<(), String> {
    let tx = UI_MIC.get().ok_or("La voz no está lista")?;
    tx.lock().unwrap_or_else(|e| e.into_inner()).send(on).map_err(|_| "La voz no está lista".to_string())
}

/// Confirma una suspensión o apagado pedido por voz (solo la orden pendiente y reciente).
#[tauri::command]
pub fn confirm_power(cmd: Command) -> Result<String, String> {
    let pending = PENDING_POWER.lock().unwrap_or_else(|e| e.into_inner()).take();
    match pending {
        Some((p, at)) if p == cmd && at.elapsed() < CONFIRM_TTL => exec::run(&cmd),
        _ => Err("La confirmación expiró: vuelve a pedirlo".into()),
    }
}

/// "Cancelar" en la isla.
#[tauri::command]
pub fn cancel_power() {
    *PENDING_POWER.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use lazo_core::commands::{MediaOp, SystemOp};

    #[test]
    fn not_a_command_goes_to_lazo_text() {
        assert_eq!(route(ParseResult::NotACommand, true), Route::SendText);
    }

    #[test]
    fn not_found_never_goes_to_lazo() {
        let r = route(ParseResult::NotFound { kind: TargetKind::Program, target: "spotifai".into() }, true);
        assert_eq!(r, Route::AskAdd(TargetKind::Program, "spotifai".into()));
        assert_ne!(r, Route::SendText);
    }

    #[test]
    fn command_is_executed() {
        let c = Command::Media(MediaOp::Next);
        assert_eq!(route(ParseResult::Command(c.clone()), true), Route::Exec(c));
    }

    #[test]
    fn no_model_asks_for_the_model() {
        assert_eq!(route(ParseResult::NotACommand, false), Route::NoModel);
        assert_eq!(route(ParseResult::Command(Command::System(SystemOp::Lock)), false), Route::NoModel);
    }

    #[test]
    fn reply_of_reads_message_and_voice() {
        assert_eq!(reply_of(&serde_json::json!({"reply": " Hola "})), (None, "Hola".into()));
        let v = serde_json::json!({"transcript": "qué tengo hoy", "reply": "Nada"});
        assert_eq!(reply_of(&v), (Some("qué tengo hoy".into()), "Nada".into()));
        assert_eq!(reply_of(&Value::Null).1, "Lazo no respondió nada");
    }

    #[test]
    fn listen_state_serializes_reply_fields() {
        let s = ListenState {
            id: 1,
            mode: ModeName::Lazo,
            phase: Phase::Thinking,
            level: None,
            text: None,
            action: None,
            extra: Extra { heard: Some("hola".into()), reply: false },
        };
        assert_eq!(serde_json::to_value(&s).unwrap(), serde_json::json!({"id":1,"mode":"lazo","phase":"thinking","heard":"hola"}));
    }

    #[test]
    fn confirm_power_rejects_unrequested_commands() {
        cancel_power();
        assert!(confirm_power(Command::System(SystemOp::Shutdown)).is_err());
    }
}
