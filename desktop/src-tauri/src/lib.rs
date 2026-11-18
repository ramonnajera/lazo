mod api;
mod autostart;
pub mod asr;
pub mod audio;
mod exec;
mod focus;
mod keyboard_hook;
mod media;
mod paste;
mod secrets;
mod settings_cmd;
mod start_menu;
mod tray;
mod voice;
mod window;

use tauri::{Emitter, Listener, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Segunda instancia lanzada por el inicio de sesión (p. ej. una entrada vieja que
            // quedó en HKLM además de la de HKCU): Lazo ya corre, no hay nada que abrir.
            if args.iter().any(|a| a == autostart::AUTOSTART_ARG) {
                return;
            }
            // Segunda instancia abierta por el usuario: abre la isla.
            let _ = app.emit_to(window::ISLAND, "tray", "open");
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| keyboard_hook::on_shortcut(app, shortcut, event.state))
                .build(),
        )
        .manage(settings_cmd::load_state())
        .manage(window::IslandRegion::default())
        .manage(keyboard_hook::HotkeyState::default())
        .invoke_handler(tauri::generate_handler![
            settings_cmd::get_config,
            settings_cmd::set_config,
            autostart::autostart_get,
            autostart::autostart_set,
            voice::copy_text,
            api::api_request,
            api::set_token,
            api::link_device,
            api::has_token,
            window::set_island_region,
            window::open_settings,
            window::remember_foreground,
            window::focus_island,
            window::restore_focus,
            window::perf_enabled,
            window::perf_log,
            tray::get_paused,
            audio::list_microphones,
            audio::mic_test,
            asr::model_status,
            asr::download_model,
            asr::delete_model,
            keyboard_hook::hotkey_status,
            keyboard_hook::set_hotkeys_suspended,
            voice::open_mic_privacy,
            voice::lazo_mic,
            voice::confirm_power,
            voice::cancel_power,
            start_menu::start_menu_list,
            focus::is_fullscreen_busy,
            media::media_state,
            media::media_control,
            media::media_seek,
            media::media_sessions
        ])
        .setup(|app| {
            // `setup` corre en el hilo principal: los comandos síncronos lo reconocen.
            window::note_main_thread();
            let handle = app.handle().clone();
            // La entrada de inicio de Windows sigue a `general.autostart` (por defecto activo).
            autostart::sync(&handle);
            tray::build(&handle)?;
            window::place_island(&handle);
            // Cambiar de monitor en Configuración recoloca la isla.
            let h = handle.clone();
            app.listen("config-changed", move |_| {
                window::place_island(&h);
                keyboard_hook::reload(&h);
                media::config_changed();
            });
            // Teclas globales → hilo de voz.
            media::start(&handle);
            let actions = keyboard_hook::install(&handle);
            voice::spawn(handle.clone(), actions);
            Ok(())
        })
        .on_window_event(|win, event| {
            if win.label() == window::ISLAND {
                window::on_island_event(win, event);
            }
            // La ventana de configuración se oculta en vez de destruirse.
            if win.label() == window::SETTINGS {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win.hide();
                    // Si Teclas estaba capturando, las teclas globales no quedan suspendidas.
                    keyboard_hook::set_hotkeys_suspended(false);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
