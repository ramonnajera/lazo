use serde::{Deserialize, Serialize};
use std::{io, path::Path};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub general: General,
    pub keys: Keys,
    pub dictation: DictationCfg,
    pub voice: VoiceCfg,
    pub commands: CommandsCfg,
    pub alerts: AlertsCfg,
    pub music: MusicCfg,
    pub connection: ConnectionCfg,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct General {
    pub autostart: bool,
    pub open_on_hover: bool,
    pub monitor: Option<String>,
    pub theme: Theme,
    pub sounds: bool,
}
impl Default for General {
    fn default() -> Self {
        Self { autostart: true, open_on_hover: true, monitor: None, theme: Theme::System, sounds: true }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Keys {
    pub dictation: String,
    pub lazo: String,
    pub open_island: String,
    pub chat: String,
}
impl Default for Keys {
    fn default() -> Self {
        Self {
            dictation: "RightCtrl".into(),
            lazo: "RightAlt".into(),
            open_island: "Ctrl+Alt+Space".into(),
            chat: "Ctrl+Alt+C".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DictationCfg {
    pub hands_free_double_tap: bool,
    pub restore_clipboard: bool,
    pub dictionary: Vec<String>,
    pub replacements: Vec<Replacement>,
}
impl Default for DictationCfg {
    fn default() -> Self {
        Self { hands_free_double_tap: true, restore_clipboard: true, dictionary: vec![], replacements: vec![] }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Replacement {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VoiceCfg {
    pub microphone: Option<String>,
    pub language: String,
}
impl Default for VoiceCfg {
    fn default() -> Self {
        Self { microphone: None, language: "es".into() }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Alias {
    pub name: String,
    pub target: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchEngine {
    pub name: String,
    pub url_template: String,
}

fn alias(name: &str, target: &str) -> Alias {
    Alias { name: name.into(), target: target.into() }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CommandsCfg {
    pub sites: Vec<Alias>,
    pub programs: Vec<Alias>,
    pub folders: Vec<Alias>,
    pub search_engines: Vec<SearchEngine>,
    pub system_enabled: bool,
    pub confirm_power: bool,
}
impl Default for CommandsCfg {
    fn default() -> Self {
        Self {
            sites: vec![
                alias("youtube", "https://www.youtube.com"),
                alias("google", "https://www.google.com"),
                alias("gmail", "https://mail.google.com"),
                alias("whatsapp", "https://web.whatsapp.com"),
                alias("calendario", "https://calendar.google.com"),
            ],
            programs: vec![],
            folders: vec![
                alias("descargas", r"%USERPROFILE%\Downloads"),
                alias("documentos", r"%USERPROFILE%\Documents"),
                alias("escritorio", r"%USERPROFILE%\Desktop"),
            ],
            search_engines: vec![
                SearchEngine { name: "youtube".into(), url_template: "https://www.youtube.com/results?search_query={q}".into() },
                SearchEngine { name: "google".into(), url_template: "https://www.google.com/search?q={q}".into() },
            ],
            system_enabled: true,
            confirm_power: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AlertsCfg {
    pub event_lead_min: u32,
    pub todos_time: String,
    pub dnd_from: Option<String>,
    pub dnd_to: Option<String>,
    pub dnd_fullscreen: bool,
}
impl Default for AlertsCfg {
    fn default() -> Self {
        Self { event_lead_min: 15, todos_time: "09:00".into(), dnd_from: None, dnd_to: None, dnd_fullscreen: true }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MusicCfg {
    pub show: bool,
    pub preferred_app: Option<String>,
}
impl Default for MusicCfg {
    fn default() -> Self {
        Self { show: true, preferred_app: None }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ConnectionCfg {
    pub api_url: String,
    pub refresh_sec: u32,
}
impl Default for ConnectionCfg {
    fn default() -> Self {
        Self { api_url: "http://localhost:18800".into(), refresh_sec: 60 }
    }
}

/// Carga la configuración; archivo ausente o JSON inválido devuelve los valores por defecto.
pub fn load(path: &Path) -> Config {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Guarda de forma atómica (archivo temporal + rename).
pub fn save(path: &Path, cfg: &Config) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_spec() {
        let c = Config::default();
        assert_eq!(c.keys.dictation, "RightCtrl");
        assert_eq!(c.keys.lazo, "RightAlt");
        assert_eq!(c.keys.open_island, "Ctrl+Alt+Space");
        assert_eq!(c.connection.api_url, "http://localhost:18800");
        assert_eq!(c.connection.refresh_sec, 60);
    }

    #[test]
    fn missing_fields_get_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("config.json");
        std::fs::write(&p, r#"{"keys":{"lazo":"RightShift"}}"#).unwrap();
        let c = load(&p);
        assert_eq!(c.keys.lazo, "RightShift");
        assert_eq!(c.keys.dictation, "RightCtrl");
    }

    #[test]
    fn corrupt_file_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("config.json");
        std::fs::write(&p, "{ not json").unwrap();
        assert_eq!(load(&p), Config::default());
        assert_eq!(load(&dir.path().join("nope.json")), Config::default());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("sub").join("config.json");
        let mut c = Config::default();
        c.general.theme = Theme::Dark;
        c.alerts.dnd_from = Some("22:00".into());
        c.commands.sites.push(Alias { name: "x".into(), target: "https://x.com".into() });
        save(&p, &c).unwrap();
        assert_eq!(load(&p), c);
        let json = std::fs::read_to_string(&p).unwrap();
        assert!(json.contains("\"openOnHover\"") && json.contains("\"dark\""));
    }
}
