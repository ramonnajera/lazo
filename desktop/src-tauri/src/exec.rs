//! Ejecuta las órdenes locales que reconoce `lazo_core::commands::parse`.
//!
//! URL, programa y carpeta con `ShellExecuteW` (con `%VARIABLES%` expandidas); volumen con
//! `IAudioEndpointVolume` del altavoz por defecto; medios con las teclas `VK_MEDIA_*` (ruling de
//! la Task 10; la Task 12 puede enrutar por media.rs); bloquear, suspender y apagar con la API
//! del sistema. Cada orden corre en un hilo propio con COM inicializado (STA, como pide el Shell).

use std::path::Path;

use lazo_core::commands::{Command, MediaOp, SystemOp, VolumeOp};
use lazo_core::config::CommandsCfg;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator, eConsole, eRender};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::System::Environment::ExpandEnvironmentStringsW;
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::Shutdown::LockWorkStation;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::core::{HSTRING, PCWSTR, w};

const VK_MEDIA_NEXT_TRACK: u16 = 0xB0;
const VK_MEDIA_PREV_TRACK: u16 = 0xB1;
const VK_MEDIA_PLAY_PAUSE: u16 = 0xB3;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Ejecuta la orden. `Ok` es el texto para la isla (`"✓ Abriendo youtube.com"`).
pub fn run(cmd: &Command) -> Result<String, String> {
    let cmd = cmd.clone();
    std::thread::spawn(move || {
        // S_FALSE / RPC_E_CHANGED_MODE no impiden seguir; solo se desinicializa si inició aquí.
        let inited = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) }.is_ok();
        let r = run_here(&cmd);
        if inited {
            unsafe { CoUninitialize() };
        }
        r
    })
    .join()
    .unwrap_or_else(|_| Err("La orden falló".into()))
}

fn run_here(cmd: &Command) -> Result<String, String> {
    match cmd {
        Command::OpenUrl(url) if !is_web_url(url) => Err("Dirección no válida".into()),
        Command::OpenUrl(url) => shell_open(url.trim()).map(|_| label(cmd, None)),
        Command::OpenProgram(t) | Command::OpenFolder(t) => shell_open(&expand_env(t)).map(|_| label(cmd, None)),
        Command::Volume(op) => volume(op),
        Command::Media(op) => media(*op),
        Command::System(op) => system(*op),
    }
}

/// Solo `http://` o `https://`: un sitio nunca puede lanzar un programa o un `file:`.
pub fn is_web_url(url: &str) -> bool {
    let u = url.trim().to_ascii_lowercase();
    let rest = u.strip_prefix("http://").or_else(|| u.strip_prefix("https://"));
    rest.is_some_and(|r| !r.is_empty())
}

/// Texto de éxito. Con la configuración, usa el nombre del alias (`"✓ Abriendo Youtube"`).
pub fn label(cmd: &Command, cfg: Option<&CommandsCfg>) -> String {
    let find = |list: &[lazo_core::config::Alias], target: &str| {
        list.iter().find(|a| a.target == target && !a.name.trim().is_empty()).map(|a| capitalize(a.name.trim()))
    };
    match cmd {
        Command::OpenUrl(url) => {
            if let Some(cfg) = cfg {
                if let Some(n) = find(&cfg.sites, url) {
                    return format!("✓ Abriendo {n}");
                }
                for se in &cfg.search_engines {
                    let prefix = se.url_template.split("{q}").next().unwrap_or("");
                    if !prefix.is_empty() && url.starts_with(prefix) && se.url_template.contains("{q}") {
                        return format!("✓ Buscando en {}", capitalize(se.name.trim()));
                    }
                }
            }
            format!("✓ Abriendo {}", host_of(url))
        }
        Command::OpenProgram(t) => {
            let n = cfg.and_then(|c| find(&c.programs, t)).unwrap_or_else(|| file_stem(t));
            format!("✓ Abriendo {n}")
        }
        Command::OpenFolder(t) => {
            let n = cfg.and_then(|c| find(&c.folders, t)).unwrap_or_else(|| file_stem(t));
            format!("✓ Abriendo {n}")
        }
        Command::Volume(VolumeOp::Mute) => "✓ Silencio".into(),
        Command::Volume(VolumeOp::Set(n)) => format!("✓ Volumen {} %", (*n).min(100)),
        Command::Volume(VolumeOp::Up) => "✓ Volumen arriba".into(),
        Command::Volume(VolumeOp::Down) => "✓ Volumen abajo".into(),
        Command::Media(op) => media_label(*op).into(),
        Command::System(SystemOp::Lock) => "✓ Bloqueando".into(),
        Command::System(SystemOp::Sleep) => "✓ Suspendiendo".into(),
        Command::System(SystemOp::Shutdown) => "✓ Apagando".into(),
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().chain(c).collect(),
        None => String::new(),
    }
}

/// `https://www.youtube.com/x` → `youtube.com`.
pub fn host_of(url: &str) -> String {
    let rest = url.split("://").nth(1).unwrap_or(url);
    let host = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    host.trim_start_matches("www.").to_string()
}

fn file_stem(t: &str) -> String {
    let t = t.trim_end_matches(['\\', '/']);
    let last = t.rsplit(['\\', '/']).next().unwrap_or(t);
    Path::new(last).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| last.to_string())
}

/// Nivel nuevo (0–1) para subir/bajar 10 % o fijar; `None` para silenciar (alterna).
pub fn next_volume(current: f32, op: &VolumeOp) -> Option<f32> {
    let v = match op {
        VolumeOp::Up => current + 0.1,
        VolumeOp::Down => current - 0.1,
        VolumeOp::Set(n) => f32::from(*n) / 100.0,
        VolumeOp::Mute => return None,
    };
    // Redondeo a centésimas para que 0.3 + 0.1 no quede en 0.39999.
    Some(((v.clamp(0.0, 1.0)) * 100.0).round() / 100.0)
}

/// `%USERPROFILE%\Downloads` → `C:\Users\…\Downloads`.
pub fn expand_env(s: &str) -> String {
    if !s.contains('%') {
        return s.to_string();
    }
    let src = HSTRING::from(s);
    let n = unsafe { ExpandEnvironmentStringsW(&src, None) };
    if n == 0 {
        return s.to_string();
    }
    let mut buf = vec![0u16; n as usize];
    let got = unsafe { ExpandEnvironmentStringsW(&src, Some(&mut buf)) };
    if got == 0 || got as usize > buf.len() {
        return s.to_string();
    }
    String::from_utf16_lossy(&buf[..got as usize - 1])
}

fn shell_open(target: &str) -> Result<(), String> {
    let file = HSTRING::from(target);
    let r = unsafe { ShellExecuteW(None, w!("open"), &file, PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
    // ShellExecuteW: > 32 es éxito.
    if r.0 as isize > 32 { Ok(()) } else { Err(format!("No pude abrir «{target}»")) }
}

fn endpoint() -> Result<IAudioEndpointVolume, String> {
    let err = |e: windows::core::Error| {
        eprintln!("exec: volumen: {e}");
        "No pude cambiar el volumen".to_string()
    };
    unsafe {
        let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(err)?;
        let dev = en.GetDefaultAudioEndpoint(eRender, eConsole).map_err(err)?;
        dev.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).map_err(err)
    }
}

fn volume(op: &VolumeOp) -> Result<String, String> {
    let ep = endpoint()?;
    let fail = |e: windows::core::Error| {
        eprintln!("exec: volumen: {e}");
        "No pude cambiar el volumen".to_string()
    };
    unsafe {
        let cur = ep.GetMasterVolumeLevelScalar().map_err(fail)?;
        match next_volume(cur, op) {
            None => {
                let muted = ep.GetMute().map_err(fail)?.as_bool();
                ep.SetMute(!muted, std::ptr::null()).map_err(fail)?;
                Ok(if muted { "✓ Sonido activado".into() } else { "✓ Silencio".into() })
            }
            Some(v) => {
                ep.SetMasterVolumeLevelScalar(v, std::ptr::null()).map_err(fail)?;
                // Cambiar el volumen a mano quita el silencio, como la tecla del teclado.
                let _ = ep.SetMute(false, std::ptr::null());
                Ok(format!("✓ Volumen {} %", (v * 100.0).round() as u32))
            }
        }
    }
}

fn media_label(op: MediaOp) -> &'static str {
    match op {
        MediaOp::PlayPause => "✓ Reproducir / pausar",
        MediaOp::Play => "✓ Reproducir",
        MediaOp::Pause => "✓ Pausa",
        MediaOp::Next => "✓ Siguiente",
        MediaOp::Previous => "✓ Anterior",
    }
}

fn key(vk: u16, up: bool) -> INPUT {
    let flags = if up { KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP } else { KEYEVENTF_EXTENDEDKEY };
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    }
}

/// Primero la sesión de medios elegida (permite play y pausa por separado); sin sesión, las teclas
/// de medios, donde play y pausa alternan. Si la sesión rechaza la orden, es un error.
fn media(op: MediaOp) -> Result<String, String> {
    match crate::media::try_control(op) {
        Ok(true) => Ok(media_label(op).into()),
        // Sin sesión de medios: solo entonces las teclas (una sesión que rechaza no se reintenta
        // con una tecla que alterna).
        Ok(false) => media_keys(op),
        Err(e) => Err(e),
    }
}

fn media_keys(op: MediaOp) -> Result<String, String> {
    let vk = match op {
        MediaOp::PlayPause | MediaOp::Play | MediaOp::Pause => VK_MEDIA_PLAY_PAUSE,
        MediaOp::Next => VK_MEDIA_NEXT_TRACK,
        MediaOp::Previous => VK_MEDIA_PREV_TRACK,
    };
    let inputs = [key(vk, false), key(vk, true)];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() { Ok(media_label(op).into()) } else { Err("Windows rechazó la tecla de medios".into()) }
}

fn system(op: SystemOp) -> Result<String, String> {
    match op {
        SystemOp::Lock => unsafe { LockWorkStation() }.map(|_| "✓ Bloqueando".into()).map_err(|e| {
            eprintln!("exec: bloquear: {e}");
            "No pude bloquear el equipo".into()
        }),
        SystemOp::Sleep => {
            enable_shutdown_privilege();
            if unsafe { SetSuspendState(false, false, false) } {
                Ok("✓ Suspendiendo".into())
            } else {
                Err("No pude suspender el equipo".into())
            }
        }
        SystemOp::Shutdown => {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("shutdown")
                .args(["/s", "/t", "0"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map(|_| "✓ Apagando".into())
                .map_err(|_| "No pude apagar el equipo".into())
        }
    }
}

/// `SetSuspendState` necesita `SeShutdownPrivilege` habilitado en el token del proceso.
fn enable_shutdown_privilege() {
    use windows::Win32::Foundation::{CloseHandle, HANDLE, LUID};
    use windows::Win32::Security::{
        AdjustTokenPrivileges, LUID_AND_ATTRIBUTES, LookupPrivilegeValueW, SE_PRIVILEGE_ENABLED, SE_SHUTDOWN_NAME,
        TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut token).is_err() {
            eprintln!("exec: OpenProcessToken falló");
            return;
        }
        let mut luid = LUID::default();
        if LookupPrivilegeValueW(None, SE_SHUTDOWN_NAME, &mut luid).is_ok() {
            let tp = TOKEN_PRIVILEGES {
                PrivilegeCount: 1,
                Privileges: [LUID_AND_ATTRIBUTES { Luid: luid, Attributes: SE_PRIVILEGE_ENABLED }],
            };
            if let Err(e) = AdjustTokenPrivileges(token, false, Some(&tp), 0, None, None) {
                eprintln!("exec: AdjustTokenPrivileges: {e}");
            }
        }
        let _ = CloseHandle(token);
    }
}

/// Sleep/Shutdown piden confirmación si `confirm_power` está activo.
pub fn needs_confirm(cmd: &Command, cfg: &CommandsCfg) -> bool {
    cfg.confirm_power && matches!(cmd, Command::System(SystemOp::Sleep | SystemOp::Shutdown))
}

/// Pregunta de la isla antes de suspender o apagar.
pub fn confirm_question(cmd: &Command) -> &'static str {
    match cmd {
        Command::System(SystemOp::Shutdown) => "¿Apagar el equipo?",
        _ => "¿Suspender el equipo?",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_steps_and_clamps() {
        assert_eq!(next_volume(0.3, &VolumeOp::Up), Some(0.4));
        assert_eq!(next_volume(0.95, &VolumeOp::Up), Some(1.0));
        assert_eq!(next_volume(0.05, &VolumeOp::Down), Some(0.0));
        assert_eq!(next_volume(0.5, &VolumeOp::Set(30)), Some(0.3));
        assert_eq!(next_volume(0.5, &VolumeOp::Set(200)), Some(1.0));
        assert_eq!(next_volume(0.5, &VolumeOp::Mute), None);
    }

    #[test]
    fn labels_use_alias_names() {
        let cfg = CommandsCfg::default();
        assert_eq!(label(&Command::OpenUrl("https://www.youtube.com".into()), Some(&cfg)), "✓ Abriendo Youtube");
        assert_eq!(
            label(&Command::OpenUrl("https://www.youtube.com/results?search_query=lofi".into()), Some(&cfg)),
            "✓ Buscando en Youtube"
        );
        assert_eq!(label(&Command::OpenUrl("https://example.com/a".into()), Some(&cfg)), "✓ Abriendo example.com");
        assert_eq!(label(&Command::OpenFolder(r"%USERPROFILE%\Downloads".into()), Some(&cfg)), "✓ Abriendo Descargas");
        assert_eq!(label(&Command::OpenProgram(r"C:\X\Spotify.lnk".into()), None), "✓ Abriendo Spotify");
    }

    #[test]
    fn only_web_urls_are_opened() {
        assert!(is_web_url("https://www.youtube.com"));
        assert!(is_web_url("HTTP://example.com"));
        assert!(!is_web_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_web_url(r"C:\Windows\System32\calc.exe"));
        assert!(!is_web_url("ms-settings:privacy"));
        assert!(!is_web_url("https://"));
        assert_eq!(run(&Command::OpenUrl("file:///C:/x".into())), Err("Dirección no válida".into()));
    }

    #[test]
    fn power_needs_confirmation_only_when_enabled() {
        let mut cfg = CommandsCfg::default();
        assert!(needs_confirm(&Command::System(SystemOp::Sleep), &cfg));
        assert!(needs_confirm(&Command::System(SystemOp::Shutdown), &cfg));
        assert!(!needs_confirm(&Command::System(SystemOp::Lock), &cfg));
        cfg.confirm_power = false;
        assert!(!needs_confirm(&Command::System(SystemOp::Shutdown), &cfg));
    }

    #[test]
    fn expands_userprofile() {
        let home = std::env::var("USERPROFILE").unwrap();
        assert_eq!(expand_env(r"%USERPROFILE%\Downloads"), format!(r"{home}\Downloads"));
        assert_eq!(expand_env("sin variables"), "sin variables");
    }

    /// Manual: abre https://example.com en el navegador. `cargo test -p lazo-desktop exec -- --ignored`.
    #[test]
    #[ignore]
    fn manual_open_url_example() {
        assert_eq!(run(&Command::OpenUrl("https://example.com".into())), Ok("✓ Abriendo example.com".into()));
    }
}
