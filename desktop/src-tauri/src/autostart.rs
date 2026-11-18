//! Inicio con Windows, solo para el usuario actual (HKCU\...\Run, valor "Lazo").
//!
//! tauri-plugin-autostart usa el modo "dinámico" de auto-launch: escribe en HKLM (todos los
//! usuarios) cuando el proceso puede, y una ejecución sin elevar después no lo puede quitar.
//! Aquí se fuerza HKCU y, al activarlo, se borra la entrada vieja de HKLM si se puede.
//!
//! La entrada lleva [`AUTOSTART_ARG`]: si quedara además una vieja en HKLM, la segunda
//! instancia del arranque de sesión se reconoce y no abre la isla.
//!
//! "Desactivado" en el Administrador de tareas (StartupApproved) solo lo cambia un
//! [`autostart_set`] explícito desde Configuración; el arranque nunca lo toca.

use auto_launch::{AutoLaunch, AutoLaunchBuilder, WindowsEnableMode};

const APP_NAME: &str = "Lazo";
/// Argumento con el que Windows arranca a Lazo al iniciar sesión.
pub const AUTOSTART_ARG: &str = "--autostart";
const RUN_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
const APPROVED_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// ERROR_FILE_NOT_FOUND como HRESULT.
const NOT_FOUND: i32 = 0x8007_0002_u32 as i32;

/// Ruta del exe entre comillas (una ruta con espacios no se partiría al arrancar).
fn exe_path() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("No se encontró el ejecutable: {e}"))?;
    Ok(format!("\"{}\"", exe.display()))
}

fn launcher(path: &str) -> Result<AutoLaunch, String> {
    AutoLaunchBuilder::new()
        .set_app_name(APP_NAME)
        .set_app_path(path)
        .set_args(&[AUTOSTART_ARG])
        .set_windows_enable_mode(WindowsEnableMode::CurrentUser)
        .build()
        .map_err(|e| e.to_string())
}

/// El valor de Run tal como lo escribe auto-launch: `"<exe>" --autostart`.
fn run_command(path: &str) -> String {
    format!("{path} {AUTOSTART_ARG}")
}

/// Quita el "Lazo" que el plugin dejó en HKLM, si existe y hay permiso (sin elevar no lo hay:
/// se ignora).
fn remove_machine_entry() {
    use windows_registry::LOCAL_MACHINE;
    for key in [RUN_KEY, APPROVED_KEY] {
        if let Ok(k) = LOCAL_MACHINE.options().read().write().open(key)
            && k.get_value(APP_NAME).is_ok()
        {
            match k.remove_value(APP_NAME) {
                Ok(()) => eprintln!("autostart: se quitó la entrada vieja de HKLM ({key})"),
                Err(e) => eprintln!("autostart: no se pudo quitar la entrada de HKLM ({key}): {e}"),
            }
        }
    }
}

/// El valor "Lazo" de HKCU\...\Run, si existe.
fn run_value() -> Result<Option<String>, String> {
    use windows_registry::CURRENT_USER;
    match CURRENT_USER.open(RUN_KEY).and_then(|k| k.get_string(APP_NAME)) {
        Ok(v) => Ok(Some(v)),
        Err(e) if e.code().0 == NOT_FOUND => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// ¿No está desactivado en el Administrador de tareas? (StartupApproved: primer byte par
/// —02, 06— = activo; impar —03— = desactivado por el usuario; sin valor = activo).
fn approved() -> bool {
    use windows_registry::CURRENT_USER;
    match CURRENT_USER.open(APPROVED_KEY).and_then(|k| k.get_value(APP_NAME)) {
        Ok(v) => v.first().is_none_or(|b| b & 1 == 0),
        Err(_) => true,
    }
}

/// Qué hace el arranque con la entrada de inicio.
#[derive(Debug, PartialEq, Eq)]
enum SyncAction {
    None,
    /// No hay entrada y se quiere: se registra (y se aprueba).
    Enable,
    /// Hay entrada pero apunta a otro exe o sin el argumento: se reescribe solo el valor de Run.
    Rewrite,
    /// Hay entrada y no se quiere.
    Disable,
}

fn decide(want: bool, current: Option<&str>, expected: &str) -> SyncAction {
    match (want, current) {
        (true, None) => SyncAction::Enable,
        (true, Some(v)) if v.trim_end() != expected.trim_end() => SyncAction::Rewrite,
        (false, Some(_)) => SyncAction::Disable,
        _ => SyncAction::None,
    }
}

pub fn set(enabled: bool) -> Result<(), String> {
    let al = launcher(&exe_path()?)?;
    if enabled {
        // Explícito desde Configuración: también vuelve a aprobarla en el Administrador de tareas.
        al.enable().map_err(|e| format!("No se pudo activar el inicio con Windows: {e}"))?;
        remove_machine_entry();
    } else {
        // Borra HKCU y, si hay permiso, HKLM (sin permiso, auto-launch lo ignora en modo CurrentUser).
        al.disable().map_err(|e| format!("No se pudo desactivar el inicio con Windows: {e}"))?;
    }
    Ok(())
}

fn rewrite_run_value(command: &str) -> Result<(), String> {
    use windows_registry::CURRENT_USER;
    CURRENT_USER.create(RUN_KEY).and_then(|k| k.set_string(APP_NAME, command)).map_err(|e| e.to_string())
}

/// Al arrancar: la entrada sigue a `general.autostart`, sin tocar nunca StartupApproved. En
/// `tauri dev` no se toca: registraría el exe de depuración.
pub fn sync(app: &tauri::AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    use tauri::Manager;
    let want = app.state::<std::sync::Mutex<lazo_core::config::Config>>().lock().unwrap_or_else(|e| e.into_inner()).general.autostart;
    let r = (|| -> Result<(), String> {
        let path = exe_path()?;
        let expected = run_command(&path);
        let current = run_value()?;
        match decide(want, current.as_deref(), &expected) {
            SyncAction::None => Ok(()),
            SyncAction::Enable => set(true),
            SyncAction::Rewrite => rewrite_run_value(&expected),
            SyncAction::Disable => set(false),
        }
    })();
    if let Err(e) = r {
        eprintln!("autostart: {e}");
    }
}

#[tauri::command]
pub fn autostart_get() -> Result<bool, String> {
    Ok(run_value()?.is_some() && approved())
}

#[tauri::command]
pub fn autostart_set(enabled: bool) -> Result<(), String> {
    set(enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXP: &str = r#""C:\Users\a\AppData\Local\Lazo\lazo-desktop.exe" --autostart"#;

    #[test]
    fn missing_entry_is_enabled_only_when_wanted() {
        assert_eq!(decide(true, None, EXP), SyncAction::Enable);
        assert_eq!(decide(false, None, EXP), SyncAction::None);
    }

    #[test]
    fn same_entry_is_left_alone_even_with_trailing_space() {
        assert_eq!(decide(true, Some(EXP), EXP), SyncAction::None);
        assert_eq!(decide(true, Some(&format!("{EXP} ")), EXP), SyncAction::None);
    }

    #[test]
    fn other_path_or_old_entry_rewrites_only_the_run_value() {
        // La del plugin viejo: sin comillas, sin argumento y con espacio final.
        let old = r"C:\Users\a\AppData\Local\Lazo\lazo-desktop.exe ";
        assert_eq!(decide(true, Some(old), EXP), SyncAction::Rewrite);
        assert_eq!(decide(true, Some(r#""D:\Lazo\lazo-desktop.exe" --autostart"#), EXP), SyncAction::Rewrite);
    }

    #[test]
    fn unwanted_entry_is_disabled() {
        assert_eq!(decide(false, Some(EXP), EXP), SyncAction::Disable);
    }

    #[test]
    fn run_command_matches_auto_launch_format() {
        assert_eq!(run_command(r#""C:\x.exe""#), r#""C:\x.exe" --autostart"#);
    }
}
