//! ¿El usuario está en pantalla completa, presentando o con un juego D3D a pantalla completa?

#[cfg(windows)]
fn busy() -> bool {
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    match unsafe { SHQueryUserNotificationState() } {
        Ok(s) => s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn busy() -> bool {
    false
}

#[tauri::command]
pub fn is_fullscreen_busy() -> bool {
    busy()
}
