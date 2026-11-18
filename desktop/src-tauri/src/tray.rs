//! Icono de la bandeja: Abrir · Configuración · Pausar · Salir.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::window::{ISLAND, show_settings};

struct Pause {
    paused: AtomicBool,
    item: MenuItem<Wry>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Configuración", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pausar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &settings, &pause, &sep, &quit])?;
    app.manage(Pause { paused: AtomicBool::new(false), item: pause });

    let mut builder = TrayIconBuilder::with_id("lazo")
        .tooltip("Lazo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "settings" => show_settings(app, None),
            "open" => {
                let _ = app.emit_to(ISLAND, "tray", "open");
            }
            "pause" => toggle_pause(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = tray.app_handle().emit_to(ISLAND, "tray", "open");
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn get_paused(app: AppHandle) -> bool {
    app.try_state::<Pause>().map(|p| p.paused.load(Ordering::Relaxed)).unwrap_or(false)
}

fn toggle_pause(app: &AppHandle) {
    let p = app.state::<Pause>();
    let now = !p.paused.load(Ordering::Relaxed);
    p.paused.store(now, Ordering::Relaxed);
    let _ = p.item.set_text(if now { "Reanudar" } else { "Pausar" });
    let _ = app.emit_to(ISLAND, "paused-changed", now);
}
