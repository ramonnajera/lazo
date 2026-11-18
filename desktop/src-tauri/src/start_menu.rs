//! Accesos directos del menú Inicio, para "Agregar desde el menú Inicio" en Órdenes.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use lazo_core::config::Alias;

const MAX_DEPTH: usize = 6;

fn roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    for var in ["ProgramData", "APPDATA"] {
        if let Ok(base) = std::env::var(var) {
            v.push(PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"));
        }
    }
    v
}

/// `.lnk` de los menús Inicio de todos los usuarios y del usuario; nombre sin extensión.
pub fn list() -> Vec<Alias> {
    collect(&roots())
}

/// Recorre las carpetas: sin desinstaladores, sin repetidos (gana la primera), por nombre.
pub fn collect(dirs: &[PathBuf]) -> Vec<Alias> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for d in dirs {
        walk(d, 0, &mut out, &mut seen);
    }
    out.sort_by_key(|a: &Alias| a.name.to_lowercase());
    out
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<Alias>, seen: &mut HashSet<String>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for entry in rd.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            walk(&path, depth + 1, out, seen);
            continue;
        }
        let is_lnk = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk"));
        let Some(name) = path.file_stem().map(|s| s.to_string_lossy().trim().to_string()) else { continue };
        let low = name.to_lowercase();
        if !is_lnk || name.is_empty() || low.contains("uninstall") || low.contains("desinstalar") {
            continue;
        }
        if seen.insert(low) {
            out.push(Alias { name, target: path.to_string_lossy().into_owned() });
        }
    }
}

#[tauri::command]
pub fn start_menu_list() -> Vec<Alias> {
    list()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_lnk_names_without_duplicates() {
        let base = std::env::temp_dir().join(format!("lazo-start-menu-{}", std::process::id()));
        let (a, b) = (base.join("a"), base.join("b"));
        std::fs::create_dir_all(a.join("Sub")).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        for p in [a.join("Spotify.lnk"), a.join("Sub").join("Notion.lnk"), a.join("Uninstall Notion.lnk"), a.join("leeme.txt"), b.join("spotify.lnk")] {
            std::fs::write(p, b"").unwrap();
        }
        let got = collect(&[a.clone(), b]);
        let names: Vec<_> = got.iter().map(|x| x.name.as_str()).collect();
        assert_eq!(names, ["Notion", "Spotify"]);
        assert!(got[1].target.ends_with(r"a\Spotify.lnk"));
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn real_start_menu_lists_without_panicking() {
        // Solo lectura: en este equipo suele haber accesos directos.
        let _ = list();
    }
}
