//! Intérprete de órdenes de voz: texto dictado -> `Command` (o nada, y entonces va a Lazo).

use serde::{Deserialize, Serialize};

use crate::config::{Alias, CommandsCfg};
use crate::dictation::{fold, levenshtein};

/// Distancia de edición normalizada máxima para aceptar un alias.
const MAX_DISTANCE: f64 = 0.34;
const MAX_WORDS: usize = 12;
const ARTICLES: &[&str] = &["el", "la", "los", "las", "un", "una", "mi"];
const FILLERS: &[&[&str]] = &[&["eh"], &["este"], &["oye"], &["lazo"], &["por", "favor"], &["porfa"]];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum VolumeOp {
    Up,
    Down,
    Set(u8),
    Mute,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaOp {
    PlayPause,
    Play,
    Pause,
    Next,
    Previous,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SystemOp {
    Lock,
    Sleep,
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Command {
    OpenUrl(String),
    OpenProgram(String),
    OpenFolder(String),
    Volume(VolumeOp),
    Media(MediaOp),
    System(SystemOp),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TargetKind {
    Site,
    Program,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ParseResult {
    Command(Command),
    NotFound { kind: TargetKind, target: String },
    NotACommand,
}

const CONNECTORS: &[&str] = &["para", "que", "y", "con", "mi", "mis"];
const DOMAIN_NOUNS: &[&str] = &[
    "recordatorio", "recordatorios", "pendiente", "pendientes", "cuenta", "cuentas", "correo", "correos",
    "nota", "notas", "evento", "eventos", "cita", "citas", "alarma", "alarmas", "tarea", "tareas",
    "calendario", "lista", "listas",
];
const POSSESSIVES: &[&str] = &["mi", "mis", "mio"];

fn fold_lower(s: &str) -> String {
    s.to_lowercase().chars().map(fold).collect()
}

/// Pares (palabra normalizada, palabra original sin puntuación de borde), sin muletillas en los extremos.
fn tokens(text: &str) -> Vec<(String, String)> {
    let mut toks: Vec<(String, String)> = text
        .split_whitespace()
        .filter_map(|raw| {
            let norm: String = fold_lower(raw).chars().filter(|c| c.is_alphanumeric()).collect();
            if norm.is_empty() {
                return None;
            }
            let orig = raw.trim_matches(|c: char| ".,;:!?¿¡\"'".contains(c)).to_string();
            Some((norm, orig))
        })
        .collect();
    loop {
        let before = toks.len();
        for f in FILLERS {
            let n = f.len();
            if toks.len() > n && toks[..n].iter().map(|t| t.0.as_str()).eq(f.iter().copied()) {
                toks.drain(..n);
            }
            if toks.len() > n && toks[toks.len() - n..].iter().map(|t| t.0.as_str()).eq(f.iter().copied()) {
                toks.truncate(toks.len() - n);
            }
        }
        if toks.len() == before {
            break;
        }
    }
    toks
}

/// Minúsculas, sin acentos (la ñ se conserva), sin signos, sin muletillas en los extremos.
pub fn normalize(text: &str) -> String {
    let cleaned: String = fold_lower(text).chars().map(|c| if c.is_alphanumeric() { c } else { ' ' }).collect();
    let joined = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    tokens(&joined).into_iter().map(|t| t.0).collect::<Vec<_>>().join(" ")
}

pub fn parse(text: &str, cfg: &CommandsCfg) -> ParseResult {
    let toks = tokens(text);
    if toks.is_empty() || toks.len() > MAX_WORDS {
        return ParseResult::NotACommand;
    }
    let words: Vec<&str> = toks.iter().map(|t| t.0.as_str()).collect();
    let orig: Vec<&str> = toks.iter().map(|t| t.1.as_str()).collect();
    let w = &words[..];
    let cmd = ParseResult::Command;

    if let Some(r) = parse_search(w, &orig, cfg) {
        return r;
    }
    // "pon el volumen al treinta", "pon pausa", "pon la siguiente"
    let w2 = if matches!(w[0], "pon" | "ponme") { skip_articles(&w[1..]) } else { w };
    if !w2.is_empty() {
        if let Some(op) = parse_volume(w2) {
            return cmd(Command::Volume(op));
        }
        if let Some(op) = parse_media(w2) {
            return cmd(Command::Media(op));
        }
    }
    if cfg.system_enabled {
        if let Some(op) = parse_system(w) {
            return cmd(Command::System(op));
        }
    }
    if let Some(r) = parse_open(w, cfg) {
        return r;
    }
    ParseResult::NotACommand
}

fn skip_articles<'a>(mut w: &'a [&'a str]) -> &'a [&'a str] {
    while let Some(first) = w.first() {
        if ARTICLES.contains(first) {
            w = &w[1..];
        } else {
            break;
        }
    }
    w
}

fn distance(a: &str, b: &str) -> f64 {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let max = a.len().max(b.len());
    if max == 0 {
        return 0.0;
    }
    levenshtein(&a, &b) as f64 / max as f64
}

/// Mejor alias dentro del umbral (se compara también sin espacios: "vscode" ~ "vs code").
fn best_alias<'a>(target: &str, aliases: &'a [Alias]) -> Option<&'a Alias> {
    let target_compact: String = target.split_whitespace().collect();
    aliases
        .iter()
        .map(|a| {
            let name = normalize(&a.name);
            let compact: String = name.split_whitespace().collect();
            let d = distance(target, &name).min(distance(&target_compact, &compact));
            (d, a)
        })
        .filter(|(d, _)| *d <= MAX_DISTANCE)
        .min_by(|x, y| x.0.partial_cmp(&y.0).unwrap())
        .map(|(_, a)| a)
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn search_url(query: &str, engine: &str, cfg: &CommandsCfg) -> Option<ParseResult> {
    let found = cfg
        .search_engines
        .iter()
        .map(|e| (distance(engine, &normalize(&e.name)), e))
        .filter(|(d, _)| *d <= MAX_DISTANCE)
        .min_by(|x, y| x.0.partial_cmp(&y.0).unwrap())
        .map(|(_, e)| e)?;
    Some(ParseResult::Command(Command::OpenUrl(
        found.url_template.replace("{q}", &urlencode(query)),
    )))
}

/// Separa `<consulta> en <motor>` si el motor existe; si no, la consulta es todo y el motor google.
fn is_lazo_query(rest: &[&str]) -> bool {
    rest.first() == Some(&"en")
        || rest.iter().any(|w| POSSESSIVES.contains(w) || DOMAIN_NOUNS.contains(w))
}

fn split_engine(rest: &[&str], orig: &[&str], cfg: &CommandsCfg) -> Option<ParseResult> {
    if rest.is_empty() || is_lazo_query(rest) {
        return None;
    }
    if let Some(pos) = rest.iter().rposition(|w| *w == "en") {
        if pos > 0 && pos + 1 < rest.len() {
            let engine = rest[pos + 1..].join(" ");
            if let Some(r) = search_url(&orig[..pos].join(" "), &engine, cfg) {
                return Some(r);
            }
        }
    }
    search_url(&orig.join(" "), "google", cfg)
}

fn parse_search(w: &[&str], orig: &[&str], cfg: &CommandsCfg) -> Option<ParseResult> {
    match w[0] {
        "busca" | "buscame" | "buscar" => split_engine(&w[1..], &orig[1..], cfg),
        "pon" | "ponme" => {
            // "pon <consulta> en youtube": solo si el motor existe, si no es "abrir".
            let rest = &w[1..];
            let pos = rest.iter().rposition(|x| *x == "en")?;
            if pos == 0 || pos + 1 >= rest.len() || is_lazo_query(&rest[..pos]) {
                return None;
            }
            search_url(&orig[1..][..pos].join(" "), &rest[pos + 1..].join(" "), cfg)
        }
        _ => None,
    }
}

fn parse_open(w: &[&str], cfg: &CommandsCfg) -> Option<ParseResult> {
    let (rest, may_not_found): (&[&str], bool) = match w[0] {
        "abre" | "abreme" | "abrir" => (&w[1..], true),
        "entra" if w.get(1) == Some(&"a") => (&w[2..], true),
        "pon" | "ponme" | "lanza" | "ejecuta" | "inicia" => (&w[1..], false),
        "ve" if w.get(1) == Some(&"a") => (&w[2..], false),
        _ => return None,
    };
    let mut rest = skip_articles(rest);
    let mut hint = None;
    if let Some(&first) = rest.first() {
        let h = match first {
            "carpeta" => Some(TargetKind::Folder),
            "pagina" | "sitio" => Some(TargetKind::Site),
            _ => None,
        };
        if h.is_some() && rest.len() > 1 {
            hint = h;
            rest = &rest[1..];
            if matches!(rest.first(), Some(&"de") | Some(&"web")) && rest.len() > 1 {
                rest = &rest[1..];
            }
            rest = skip_articles(rest);
        }
    }
    if rest.is_empty() {
        return None;
    }
    let target = rest.join(" ");
    if let Some(a) = best_alias(&target, &cfg.folders) {
        return Some(ParseResult::Command(Command::OpenFolder(a.target.clone())));
    }
    if let Some(a) = best_alias(&target, &cfg.sites) {
        return Some(ParseResult::Command(Command::OpenUrl(a.target.clone())));
    }
    if let Some(a) = best_alias(&target, &cfg.programs) {
        return Some(ParseResult::Command(Command::OpenProgram(a.target.clone())));
    }
    let plausible = may_not_found
        && rest.len() <= 3
        && !rest.iter().any(|x| CONNECTORS.contains(x) || DOMAIN_NOUNS.contains(x));
    if !plausible {
        return None;
    }
    Some(ParseResult::NotFound { kind: hint.unwrap_or(TargetKind::Program), target })
}

fn parse_number(w: &[&str]) -> Option<u8> {
    if w.len() == 1 {
        if let Some(n) = w[0].parse::<u8>().ok().filter(|n| *n <= 100) {
            return Some(n);
        }
    }
    fn unit(s: &str) -> Option<u8> {
        Some(match s {
            "cero" => 0, "uno" | "un" | "una" => 1, "dos" => 2, "tres" => 3, "cuatro" => 4,
            "cinco" => 5, "seis" => 6, "siete" => 7, "ocho" => 8, "nueve" => 9, "diez" => 10,
            "once" => 11, "doce" => 12, "trece" => 13, "catorce" => 14, "quince" => 15,
            "dieciseis" => 16, "diecisiete" => 17, "dieciocho" => 18, "diecinueve" => 19,
            "veinte" => 20, "veintiuno" => 21, "veintidos" => 22, "veintitres" => 23,
            "veinticuatro" => 24, "veinticinco" => 25, "veintiseis" => 26, "veintisiete" => 27,
            "veintiocho" => 28, "veintinueve" => 29,
            _ => return None,
        })
    }
    fn tens(s: &str) -> Option<u8> {
        Some(match s {
            "treinta" => 30, "cuarenta" => 40, "cincuenta" => 50, "sesenta" => 60,
            "setenta" => 70, "ochenta" => 80, "noventa" => 90,
            _ => return None,
        })
    }
    match w {
        ["cien"] | ["ciento"] => Some(100),
        [one] => unit(one).or_else(|| tens(one)),
        [t, "y", u] => {
            let (t, u) = (tens(t)?, unit(u)?);
            (1..=9).contains(&u).then_some(t + u)
        }
        _ => None,
    }
}

fn parse_volume(w: &[&str]) -> Option<VolumeOp> {
    if w.is_empty() {
        return None;
    }
    match w {
        ["silencio"] | ["silencia"] | ["mutea"] | ["quita", "el", "sonido"] | ["quita", "sonido"] => {
            return Some(VolumeOp::Mute);
        }
        _ => {}
    }
    let (verb, mut rest) = (w[0], skip_articles(&w[1..]));
    // "sube un poco el volumen" / "baja tantito el volumen": el matiz no cambia la orden.
    if matches!(verb, "sube" | "baja") {
        // skip_articles ya se comió el "un" de "un poco".
        if matches!(rest.first(), Some(&"poco") | Some(&"poquito") | Some(&"tantito")) {
            rest = skip_articles(&rest[1..]);
        }
    }
    match (verb, rest) {
        ("sube", ["volumen"]) => Some(VolumeOp::Up),
        ("baja", ["volumen"]) => Some(VolumeOp::Down),
        ("volumen", rest) => {
            let mut r = rest;
            if matches!(r.first(), Some(&"al") | Some(&"a")) {
                r = &r[1..];
            }
            if r.len() >= 2 && r[r.len() - 2..] == ["por", "ciento"] {
                r = &r[..r.len() - 2];
            }
            parse_number(r).filter(|n| *n <= 100).map(VolumeOp::Set)
        }
        _ => None,
    }
}

fn parse_media(w: &[&str]) -> Option<MediaOp> {
    match w {
        ["pausa"] | ["pausar"] | ["deten", "la", "musica"] | ["deten", "musica"] => Some(MediaOp::Pause),
        ["pausa" | "pausar", "la", "musica" | "cancion"] | ["pausa" | "pausar", "musica" | "cancion"] => {
            Some(MediaOp::Pause)
        }
        ["reanuda"] | ["continua"] | ["play"] | ["dale", "play"] => Some(MediaOp::Play),
        ["reanuda" | "continua", "la", "musica" | "cancion"] | ["reanuda" | "continua", "musica" | "cancion"] => {
            Some(MediaOp::Play)
        }
        ["siguiente"] | ["siguiente", "cancion"] | ["la", "que", "sigue"] => Some(MediaOp::Next),
        ["anterior"] | ["la", "anterior"] | ["regresa", "la", "cancion"] => Some(MediaOp::Previous),
        _ => None,
    }
}

fn parse_system(w: &[&str]) -> Option<SystemOp> {
    let rest = skip_articles(&w[1..]);
    let pc = matches!(rest, ["compu"] | ["computadora"] | ["pc"]);
    match w[0] {
        "bloquea" if pc || matches!(rest, ["pantalla"]) => Some(SystemOp::Lock),
        "suspende" | "duerme" if pc => Some(SystemOp::Sleep),
        "apaga" if pc => Some(SystemOp::Shutdown),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_punctuation_accents_fillers() {
        assert_eq!(normalize("Ábreme YouTube."), "abreme youtube");
        assert_eq!(normalize("eh, abre el spotify por favor"), "abre el spotify");
        assert_eq!(normalize("Oye Lazo, sube el volumen"), "sube el volumen");
        assert_eq!(normalize("Año nuevo"), "año nuevo");
    }

    #[test]
    fn numbers_in_words() {
        assert_eq!(parse_number(&["treinta", "y", "cinco"]), Some(35));
        assert_eq!(parse_number(&["cien"]), Some(100));
        assert_eq!(parse_number(&["veintiuno"]), Some(21));
        assert_eq!(parse_number(&["cero"]), Some(0));
        assert_eq!(parse_number(&["150"]), None);
    }

    #[test]
    fn urlencode_spaces_and_reserved() {
        assert_eq!(urlencode("lo fi"), "lo+fi");
        assert_eq!(urlencode("a&b"), "a%26b");
        assert_eq!(urlencode("año"), "a%C3%B1o");
    }

    #[test]
    fn serde_names_are_plain() {
        assert_eq!(serde_json::to_string(&MediaOp::PlayPause).unwrap(), "\"PlayPause\"");
    }
}
