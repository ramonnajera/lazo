// Adapted from coucou (https://github.com/Louis-CFM/coucou), MIT License, Copyright (c) Louis Raillé
//! Teclas globales: gancho `WH_KEYBOARD_LL` en un hilo propio (solo mira, nunca se traga una
//! tecla, salvo el key-up de Alt derecho tras usarla como tecla de Lazo) y los atajos
//! "abrir isla" / "chat" con tauri-plugin-global-shortcut.
//!
//! El gancho corre la [`HotkeyMachine`] directamente (es pura y rápida) y manda las acciones
//! al hilo de voz por un canal; el hilo de voz llama [`tick`] para vencer el doble toque.
//!
//! Vigilancia del gancho: Windows quita en silencio un gancho de bajo nivel que tardó demasiado
//! (LowLevelHooksTimeout) y, en la práctica, a veces tras suspender o bloquear la sesión. No hay
//! forma fiable de saber si sigue puesto, así que el hilo del gancho lo reinstala (quitar + poner,
//! en el mismo hilo, sin carrera con el propio gancho) cada 5 minutos, al desbloquear la sesión
//! (WM_WTSSESSION_CHANGE) y al volver de la suspensión (WM_POWERBROADCAST), recibidos en una
//! ventana oculta propia del hilo.

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;

use lazo_core::config::Config;
use lazo_core::hotkey::{Action, Binding, HotkeyMachine, KeyEvent, Mode, PhysKey};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::RemoteDesktop::{NOTIFY_FOR_THIS_SESSION, WTSRegisterSessionNotification};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, SendInput,
    VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, HHOOK, KBDLLHOOKSTRUCT,
    LLKHF_INJECTED, MSG, RegisterClassW, SetTimer, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
    WH_KEYBOARD_LL, WINDOW_EX_STYLE, WINDOW_STYLE, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WM_TIMER,
    WNDCLASSW,
};
use windows::core::w;

use crate::window::ISLAND;

const VK_LSHIFT: u32 = 0xA0;
const VK_RSHIFT: u32 = 0xA1;
const VK_LCONTROL: u32 = 0xA2;
const VK_RCONTROL: u32 = 0xA3;
const VK_LMENU: u32 = 0xA4;
const VK_RMENU: u32 = 0xA5;
const VK_LWIN: u32 = 0x5B;
/// Tecla "sin nombre": no hace nada en ningún programa, pero cuenta como "otra tecla"
/// mientras Alt está abajo, así soltar Alt no abre el menú del programa activo.
const VK_NONAME: u16 = 0xFC;

static MACHINE: Mutex<Option<HotkeyMachine>> = Mutex::new(None);
static SINK: Mutex<Option<Sender<Action>>> = Mutex::new(None);
/// Configuración → Teclas está capturando una tecla nueva: nada dispara.
static SUSPENDED: AtomicBool = AtomicBool::new(false);
/// La tecla de Lazo es Alt derecho.
static LAZO_IS_RALT: AtomicBool = AtomicBool::new(false);
/// Alt derecho se usó como tecla de Lazo desde que bajó: hay que enmascarar su key-up.
static ALT_MASK: AtomicBool = AtomicBool::new(false);
/// Gancho instalado ahora (HHOOK como entero; 0 = ninguno). Solo lo toca el hilo del gancho.
static HOOK: AtomicIsize = AtomicIsize::new(0);
/// Error del gancho para Configuración → Teclas (lo actualiza también la reinstalación).
static HOOK_ERR: Mutex<Option<String>> = Mutex::new(None);
/// `dwExtraInfo` de las teclas que manda Lazo (Ctrl+V, el texto del dictado): el gancho las
/// ignora aunque Windows no las marque como inyectadas.
pub const INJECTED_MARK: usize = 0x414C_4943;

const REINSTALL_EVERY_MS: u32 = 5 * 60 * 1000;
const WM_WTSSESSION_CHANGE: u32 = 0x02B1;
const WTS_SESSION_UNLOCK: usize = 0x8;
const WM_POWERBROADCAST: u32 = 0x0218;
const PBT_APMRESUMESUSPEND: usize = 0x7;
const PBT_APMRESUMEAUTOMATIC: usize = 0x12;

/// Errores visibles en Configuración → Teclas.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    pub hook: Option<String>,
    pub open_island: Option<String>,
    pub chat: Option<String>,
}

#[derive(Default)]
pub struct HotkeyState {
    status: Mutex<HotkeyStatus>,
    shortcuts: Mutex<(Option<Shortcut>, Option<Shortcut>)>,
}

fn phys(vk: u32) -> PhysKey {
    match vk {
        VK_LCONTROL => PhysKey::LCtrl,
        VK_RCONTROL => PhysKey::RCtrl,
        VK_LMENU => PhysKey::LAlt,
        VK_RMENU => PhysKey::RAlt,
        VK_LSHIFT => PhysKey::LShift,
        VK_RSHIFT => PhysKey::RShift,
        VK_LWIN => PhysKey::LWin,
        other => PhysKey::Other(other),
    }
}

fn is_modifier(vk: u32) -> bool {
    matches!(vk, 0x10 | 0x11 | 0x12 | 0x14 | VK_LSHIFT..=VK_RMENU | VK_LWIN | 0x5C | 0xFC)
}

fn send(action: Action) {
    if let Some(tx) = SINK.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let _ = tx.send(action);
    }
}

unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        // SAFETY: con WH_KEYBOARD_LL y code >= 0, lparam apunta a un KBDLLHOOKSTRUCT válido.
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let msg = wparam.0 as u32;
        let down = matches!(msg, WM_KEYDOWN | WM_SYSKEYDOWN);
        let up = matches!(msg, WM_KEYUP | WM_SYSKEYUP);
        if down || up {
            let e = KeyEvent {
                key: phys(info.vkCode),
                down,
                injected: info.flags.0 & LLKHF_INJECTED.0 != 0 || info.dwExtraInfo == INJECTED_MARK,
                t_ms: info.time as u64,
            };
            if on_key(e, info.vkCode) {
                return LRESULT(1);
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// Devuelve `true` si el evento se traga (solo el key-up de Alt derecho enmascarado).
fn on_key(e: KeyEvent, vk: u32) -> bool {
    if e.injected || SUSPENDED.load(Ordering::Relaxed) {
        return false;
    }
    let (action, lazo_active) = {
        let mut guard = MACHINE.lock().unwrap_or_else(|e| e.into_inner());
        let Some(m) = guard.as_mut() else { return false };
        let a = m.on_event(e);
        (a, m.active() == Some(Mode::Lazo))
    };
    if action != Action::None {
        send(action);
    }
    if LAZO_IS_RALT.load(Ordering::Relaxed) {
        match e.key {
            PhysKey::RAlt if e.down => {
                if lazo_active || matches!(action, Action::Start(Mode::Lazo) | Action::Stop(Mode::Lazo)) {
                    ALT_MASK.store(true, Ordering::Relaxed);
                }
            }
            PhysKey::RAlt => {
                if ALT_MASK.swap(false, Ordering::Relaxed) {
                    return mask_alt_release();
                }
            }
            // Un atajo real (AltGr+Q → @) ya evita el menú: no hay nada que enmascarar.
            PhysKey::Other(_) if e.down && !is_modifier(vk) => ALT_MASK.store(false, Ordering::Relaxed),
            _ => {}
        }
    }
    false
}

fn key_input(vk: u16, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    }
}

/// En lugar del key-up de Alt derecho: `VK_NONAME` abajo/arriba y luego Alt derecho arriba,
/// todo inyectado (el gancho lo deja pasar). Si Windows lo rechaza, pasa el key-up original.
fn mask_alt_release() -> bool {
    let inputs = [
        key_input(VK_NONAME, 0, KEYBD_EVENT_FLAGS(0)),
        key_input(VK_NONAME, 0, KEYEVENTF_KEYUP),
        key_input(VK_RMENU as u16, 0x38, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP),
    ];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    sent as usize == inputs.len()
}

fn now_ms() -> u64 {
    // El mismo reloj de 32 bits que KBDLLHOOKSTRUCT::time; la máquina resta con wrapping.
    unsafe { GetTickCount() as u64 }
}

/// Vence la espera del doble toque; lo llama el hilo de voz cada ~20 ms.
pub fn tick() -> Action {
    MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_mut().map(|m| m.tick(now_ms())).unwrap_or(Action::None)
}

/// La grabación terminó sola (error, tope de 120 s): la máquina vuelve a reposo.
pub fn reset() {
    if let Some(m) = MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        m.reset();
    }
}

fn bindings(cfg: &Config) -> (Binding, Binding, bool) {
    let dictation = Binding::parse(&cfg.keys.dictation).unwrap_or(Binding::RightCtrl);
    let lazo = Binding::parse(&cfg.keys.lazo).unwrap_or(Binding::RightAlt);
    (dictation, lazo, cfg.dictation.hands_free_double_tap)
}

fn configure(cfg: &Config) {
    let (dictation, lazo, double_tap) = bindings(cfg);
    LAZO_IS_RALT.store(lazo == Binding::RightAlt && dictation != Binding::RightAlt, Ordering::Relaxed);
    let dropped = {
        let mut guard = MACHINE.lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_mut() {
            Some(m) => m.reconfigure(dictation, lazo, double_tap),
            None => {
                *guard = Some(HotkeyMachine::new(dictation, lazo, double_tap));
                false
            }
        }
    };
    // Cambiaron las teclas en plena grabación: el hilo de voz la descarta.
    if dropped {
        send(Action::Cancel);
    }
}

/// ¿La tecla lleva abajo lo suficiente (o está en manos libres) para abrir el micrófono?
pub fn should_open_mic() -> bool {
    MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_some_and(|m| m.should_open_mic(now_ms()))
}

/// Pone un gancho nuevo y quita el anterior (si había). Si el nuevo falla, el anterior queda.
fn set_hook(module: Option<HINSTANCE>) -> Result<(), String> {
    let h = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), module, 0) }.map_err(|e| e.to_string())?;
    let old = HOOK.swap(h.0 as isize, Ordering::Relaxed);
    if old != 0 {
        let _ = unsafe { UnhookWindowsHookEx(HHOOK(old as *mut core::ffi::c_void)) };
    }
    Ok(())
}

fn unhook() {
    let old = HOOK.swap(0, Ordering::Relaxed);
    if old != 0 {
        let _ = unsafe { UnhookWindowsHookEx(HHOOK(old as *mut core::ffi::c_void)) };
    }
}

fn set_hook_error(msg: Option<String>) {
    *HOOK_ERR.lock().unwrap_or_else(|e| e.into_inner()) = msg;
}

/// Pone un gancho nuevo antes de quitar el viejo: nunca queda un rato sin gancho y, si el
/// nuevo no se puede poner, sigue el anterior. Corre en el hilo del gancho (desde su bucle de
/// mensajes), así que ningún evento pasa por los dos ni se procesa a medias.
fn reinstall(why: &str) {
    let module: Option<HINSTANCE> = unsafe { GetModuleHandleW(None) }.ok().map(Into::into);
    match set_hook(module) {
        Ok(()) => {
            eprintln!("keys: gancho reinstalado ({why})");
            set_hook_error(None);
        }
        Err(e) => {
            eprintln!("keys: no se pudo reinstalar el gancho ({why}): {e}");
            // Si había gancho, sigue puesto: solo no se pudo renovar.
            let msg = if HOOK.load(Ordering::Relaxed) != 0 {
                format!("No se pudo renovar el gancho de teclado (sigue el anterior): {e}")
            } else {
                format!("No se pudo vigilar el teclado: {e}")
            };
            set_hook_error(Some(msg));
        }
    }
}

unsafe extern "system" fn watch_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_TIMER => reinstall("cada 5 min"),
        WM_WTSSESSION_CHANGE if wparam.0 == WTS_SESSION_UNLOCK => reinstall("sesión desbloqueada"),
        WM_POWERBROADCAST if matches!(wparam.0, PBT_APMRESUMESUSPEND | PBT_APMRESUMEAUTOMATIC) => {
            reinstall("vuelta de la suspensión")
        }
        _ => {}
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// Ventana oculta (no "message-only": esas no reciben WM_POWERBROADCAST) con el temporizador y
/// los avisos de sesión. Si no se puede crear, queda un temporizador del hilo (sin ventana).
fn start_watchdog(module: Option<HINSTANCE>) {
    unsafe {
        let class = WNDCLASSW {
            lpfnWndProc: Some(watch_proc),
            hInstance: module.unwrap_or_default(),
            lpszClassName: w!("LazoDesktopKeysWatch"),
            ..Default::default()
        };
        let hwnd = if RegisterClassW(&class) != 0 {
            CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("LazoDesktopKeysWatch"),
                w!(""),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                None,
                None,
                module,
                None,
            )
            .ok()
        } else {
            None
        };
        match hwnd {
            Some(h) => {
                if let Err(e) = WTSRegisterSessionNotification(h, NOTIFY_FOR_THIS_SESSION) {
                    eprintln!("keys: sin avisos de sesión: {e}");
                }
                SetTimer(Some(h), 1, REINSTALL_EVERY_MS, None);
            }
            None => {
                eprintln!("keys: sin ventana de vigilancia; solo el temporizador");
                SetTimer(None, 0, REINSTALL_EVERY_MS, None);
            }
        }
    }
}

/// Instala el gancho y los atajos. Devuelve el receptor de acciones para el hilo de voz.
pub fn install(app: &AppHandle) -> Receiver<Action> {
    let cfg = app.state::<Mutex<Config>>().lock().unwrap_or_else(|e| e.into_inner()).clone();
    configure(&cfg);
    let (tx, rx) = mpsc::channel();
    *SINK.lock().unwrap_or_else(|e| e.into_inner()) = Some(tx);

    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let spawned = std::thread::Builder::new().name("lazo-keys".into()).spawn(move || unsafe {
        let module: Option<HINSTANCE> = GetModuleHandleW(None).ok().map(Into::into);
        if let Err(err) = set_hook(module) {
            let _ = ready_tx.send(Err(err));
            return;
        }
        let _ = ready_tx.send(Ok(()));
        start_watchdog(module);
        // El gancho vive lo que vive la app: el bucle de mensajes lo mantiene atendido.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            // Temporizador del hilo (sin ventana de vigilancia).
            if msg.message == WM_TIMER && msg.hwnd.0.is_null() {
                reinstall("cada 5 min");
                continue;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        unhook();
    });
    let hook_err = match spawned {
        Err(e) => Some(e.to_string()),
        Ok(_) => match ready_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(())) => None,
            Ok(Err(e)) => Some(e),
            Err(_) => Some("el gancho de teclado no arrancó".into()),
        },
    };
    match &hook_err {
        None => eprintln!("keys: gancho de teclado instalado (dictado {}, Lazo {})", cfg.keys.dictation, cfg.keys.lazo),
        Some(e) => eprintln!("keys: no se pudo instalar el gancho de teclado: {e}"),
    }
    set_hook_error(hook_err.map(|e| format!("No se pudo vigilar el teclado: {e}")));
    register_shortcuts(app, &cfg);
    rx
}

/// Se llama al cambiar la configuración.
pub fn reload(app: &AppHandle) {
    let cfg = app.state::<Mutex<Config>>().lock().unwrap_or_else(|e| e.into_inner()).clone();
    configure(&cfg);
    register_shortcuts(app, &cfg);
}

fn parse_shortcut(s: &str) -> Result<Option<Shortcut>, String> {
    let s = s.trim();
    if s.is_empty() {
        return Ok(None);
    }
    s.parse::<Shortcut>().map(Some).map_err(|e| format!("«{s}» no es un atajo válido: {e}"))
}

fn register_shortcuts(app: &AppHandle, cfg: &Config) {
    let gs = app.global_shortcut();
    let state = app.state::<HotkeyState>();
    let mut current = state.shortcuts.lock().unwrap_or_else(|e| e.into_inner());
    for s in [current.0.take(), current.1.take()].into_iter().flatten() {
        let _ = gs.unregister(s);
    }
    let register = |text: &str| -> (Option<Shortcut>, Option<String>) {
        match parse_shortcut(text) {
            Ok(None) => (None, None),
            Err(e) => (None, Some(e)),
            Ok(Some(s)) => match gs.register(s) {
                Ok(()) => (Some(s), None),
                Err(e) => (None, Some(format!("No se pudo registrar «{text}» (¿lo usa otro programa?): {e}"))),
            },
        }
    };
    let (open, open_err) = register(&cfg.keys.open_island);
    let (chat, chat_err) =
        if cfg.keys.chat.trim() == cfg.keys.open_island.trim() { (None, None) } else { register(&cfg.keys.chat) };
    *current = (open, chat);
    let mut st = state.status.lock().unwrap_or_else(|e| e.into_inner());
    st.open_island = open_err;
    st.chat = chat_err;
    for e in [&st.open_island, &st.chat].into_iter().flatten() {
        eprintln!("keys: {e}");
    }
}

/// Manejador de tauri-plugin-global-shortcut.
pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, state: ShortcutState) {
    if state != ShortcutState::Pressed || SUSPENDED.load(Ordering::Relaxed) {
        return;
    }
    let (open, chat) = *app.state::<HotkeyState>().shortcuts.lock().unwrap_or_else(|e| e.into_inner());
    if open.as_ref() == Some(shortcut) {
        let _ = app.emit_to(ISLAND, "hotkey", "toggle");
    } else if chat.as_ref() == Some(shortcut) {
        let _ = app.emit_to(ISLAND, "hotkey", "chat");
    }
}

#[tauri::command]
pub fn hotkey_status(state: tauri::State<'_, HotkeyState>) -> HotkeyStatus {
    let mut st = state.status.lock().unwrap_or_else(|e| e.into_inner()).clone();
    st.hook = HOOK_ERR.lock().unwrap_or_else(|e| e.into_inner()).clone();
    st
}

/// Mientras Configuración → Teclas captura una tecla nueva, las teclas no disparan nada.
#[tauri::command]
pub fn set_hotkeys_suspended(suspended: bool) {
    SUSPENDED.store(suspended, Ordering::Relaxed);
    if suspended {
        let was_active = MACHINE.lock().unwrap_or_else(|e| e.into_inner()).as_mut().is_some_and(|m| {
            let active = m.active().is_some();
            m.reset();
            active
        });
        if was_active {
            send(Action::Cancel);
        }
    }
}
