use lazo_core::config::{self, Config};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, State};

/// `%APPDATA%\LazoDesktop\config.json`
pub fn config_path() -> PathBuf {
    let base = std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
    base.join("LazoDesktop").join("config.json")
}

pub fn load_state() -> Mutex<Config> {
    Mutex::new(config::load(&config_path()))
}

#[tauri::command]
pub fn get_config(state: State<'_, Mutex<Config>>) -> Config {
    state.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn set_config(app: AppHandle, state: State<'_, Mutex<Config>>, cfg: Config) -> Result<(), String> {
    config::save(&config_path(), &cfg).map_err(|e| e.to_string())?;
    *state.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    app.emit("config-changed", cfg).map_err(|e| e.to_string())
}
