//! Posproceso del texto dictado: reemplazos y diccionario personal.

use crate::config::DictationCfg;

/// Palabras de hasta estas letras nunca se corrigen ("de", "la", "sal"…).
const MAX_UNTOUCHED_LEN: usize = 3;
/// Distancia de edición máxima relativa al largo de la palabra dicha.
const MAX_RELATIVE_DISTANCE: f64 = 0.25;

/// Palabras frecuentes del español que el diccionario nunca reescribe (las de ≤ 3 letras
/// ya no se tocan). Se comparan sin acentos.
const COMMON_WORDS: &[&str] = &[
    "abre", "abrir", "abajo", "acaba", "acabo", "aceite", "acerca", "ahora", "algo", "alguien", "algún",
    "alguna", "algunas", "alguno", "algunos", "allá", "allí", "alto", "alta", "amigo", "amiga", "amor",
    "antes", "años", "aquí", "aquel", "aquella", "arriba", "aunque", "ayer", "ayuda", "bajo", "bastante",
    "bien", "bueno", "buena", "buenas", "buenos", "busca", "buscar", "cada", "caja", "calle", "cama",
    "cambio", "camino", "campo", "cara", "carta", "casa", "casi", "caso", "cerca", "cierto", "cinco",
    "ciudad", "claro", "clase", "coche", "cola", "comer", "como", "cómo", "compra", "comprar", "contra",
    "correo", "cosa", "cosas", "creo", "cual", "cuál", "cuando", "cuándo", "cuanto", "cuánto", "cuarto",
    "cuenta", "cuerpo", "dame", "dando", "debe", "deber", "decir", "deja", "dejar", "dentro", "desde",
    "después", "días", "dice", "dicen", "dijo", "dime", "dinero", "donde", "dónde", "durante", "echa", "ella",
    "ellas", "ello", "ellos", "empieza", "encima", "entonces", "entre", "envía", "enviar", "eran", "eres",
    "esas", "esos", "esta", "está", "estaba", "están", "estar", "este", "esto", "estos", "estoy", "fácil",
    "falta", "favor", "fecha", "final", "forma", "foto", "fuera", "fueron", "gana", "ganas", "gente", "gira",
    "giro", "gracias", "gran", "grande", "grupo", "gusta", "había", "hace", "hacer", "hacia", "hago", "hasta",
    "hecho", "hermano", "hermana", "hija", "hijo", "hola", "hombre", "hora", "horas", "hoja", "idea", "igual",
    "juego", "junto", "lado", "largo", "leer", "lejos", "libro", "lista", "llama", "llamar", "llega",
    "llegar", "lleva", "llevar", "luego", "lugar", "madre", "mañana", "mano", "manos", "mayor", "medio",
    "mejor", "menos", "mensaje", "mesa", "meta", "mete", "mientras", "minuto", "mira", "mirar", "misma",
    "mismo", "modo", "momento", "mucha", "mucho", "muchos", "mujer", "mundo", "nada", "nadie", "nación",
    "necesito", "negro", "ningún", "ninguna", "noche", "nodo", "nombre", "nosotros", "nota", "noción",
    "nueva", "nuevo", "nunca", "número", "obra", "otra", "otras", "otro", "otros", "padre", "pagar", "país",
    "palabra", "para", "parece", "parte", "pasa", "pasar", "paso", "pedir", "pega", "pegar", "pena", "pero",
    "persona", "pide", "pienso", "poco", "poder", "pone", "poner", "porque", "pues", "puede", "pueden",
    "puedo", "punto", "queda", "quedar", "quiere", "quiero", "quien", "quién", "rato", "razón", "real",
    "rojo", "ropa", "sabe", "saber", "sale", "salir", "según", "segundo", "semana", "señor", "señora",
    "sería", "sido", "siempre", "siente", "sigue", "siguiente", "sino", "sobre", "solo", "sólo", "somos",
    "sube", "subir", "suena", "tabla", "también", "tampoco", "tanto", "tarde", "tarea", "tema", "tengo",
    "tenía", "tener", "tiempo", "tiene", "tienen", "tienda", "tierra", "tipo", "tira", "tirar", "toca",
    "todo", "toda", "todas", "todos", "toma", "tomar", "trabajo", "trae", "traer", "tres", "último", "unas",
    "unos", "usar", "vale", "vamos", "varios", "veces", "venga", "verdad", "vida", "viene", "vuelve",
    "abierto", "abrió", "agua", "aire", "alma", "aparte", "apaga", "apagar", "avisa", "avisar", "baja",
    "bajar", "borra", "borrar", "calma", "carga", "cargar", "cerrar", "cierra", "cine", "clave", "color",
    "corre", "correr", "costa", "cree", "creer", "cuesta", "cumple", "dato", "datos", "dedo", "diga", "dile",
    "dios", "dolor", "duda", "edad", "ejemplo", "elige", "entra", "entrar", "escribe", "escribir", "espera",
    "esperar", "fila", "fuego", "guarda", "guardar", "hijos", "inicio", "juega", "jugar", "lanza", "lunes",
    "martes", "jueves", "viernes", "sábado", "domingo", "marca", "mapa", "mueve", "música", "nivel", "nieve",
    "nube", "ojos", "onda", "orden", "pausa", "piso", "plan", "plaza", "precio", "presa", "prueba", "puerta",
    "queso", "quita", "quitar", "radio", "rama", "rango", "reina", "resto", "rueda", "sala", "salta", "sigo",
    "silla", "sitio", "tapa", "tela", "tono", "total", "tren", "vela", "venta", "vista", "vuela", "zona",
];

/// 1) reemplazos exactos por palabra completa sin distinguir mayúsculas;
/// 2) el diccionario corrige a su forma escrita las palabras parecidas: misma primera letra
///    (sin mayúsculas ni acentos), distancia / largo ≤ 0,25, más de 3 letras y que no sean
///    palabras frecuentes del español; 3) recorta espacios.
pub fn apply_dictation(text: &str, cfg: &DictationCfg) -> String {
    let mut segments: Vec<(Vec<char>, bool)> = vec![(text.chars().collect(), false)];
    for r in &cfg.replacements {
        let from: Vec<char> = r.from.trim().chars().collect();
        if from.is_empty() {
            continue;
        }
        segments = segments
            .into_iter()
            .flat_map(|(chars, protected)| if protected { vec![(chars, true)] } else { replace_whole(&chars, &from, &r.to) })
            .collect();
    }
    let dictionary: Vec<(Vec<char>, &str)> = cfg
        .dictionary
        .iter()
        .map(|w| w.trim())
        .filter(|w| !w.is_empty() && !w.contains(char::is_whitespace))
        .map(|w| (lower(w), w))
        .collect();
    let mut out = String::new();
    for (chars, protected) in segments {
        if protected || dictionary.is_empty() {
            out.extend(chars);
        } else {
            out.push_str(&fix_words(&chars, &dictionary));
        }
    }
    out.trim().to_string()
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric()
}

fn lower(s: &str) -> Vec<char> {
    s.chars().flat_map(char::to_lowercase).collect()
}

fn eq_ci(a: char, b: char) -> bool {
    a == b || a.to_lowercase().eq(b.to_lowercase())
}

/// Parte `chars` en tramos, marcando como protegidos los reemplazos hechos.
fn replace_whole(chars: &[char], from: &[char], to: &str) -> Vec<(Vec<char>, bool)> {
    let mut out = Vec::new();
    let mut plain = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let fits = i + from.len() <= chars.len()
            && chars[i..i + from.len()].iter().zip(from).all(|(&a, &b)| eq_ci(a, b))
            && (i == 0 || !is_word(chars[i - 1]))
            && (i + from.len() == chars.len() || !is_word(chars[i + from.len()]));
        if fits {
            if !plain.is_empty() {
                out.push((std::mem::take(&mut plain), false));
            }
            out.push((to.chars().collect(), true));
            i += from.len();
        } else {
            plain.push(chars[i]);
            i += 1;
        }
    }
    if !plain.is_empty() {
        out.push((plain, false));
    }
    out
}

fn fix_words(chars: &[char], dictionary: &[(Vec<char>, &str)]) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if !is_word(chars[i]) {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len() && is_word(chars[i]) {
            i += 1;
        }
        let word: String = chars[start..i].iter().collect();
        out.push_str(best_match(&word, dictionary).unwrap_or(&word));
    }
    out
}

pub(crate) fn fold(c: char) -> char {
    match c {
        'á' | 'à' | 'ä' | 'â' => 'a',
        'é' | 'è' | 'ë' | 'ê' => 'e',
        'í' | 'ì' | 'ï' | 'î' => 'i',
        'ó' | 'ò' | 'ö' | 'ô' => 'o',
        'ú' | 'ù' | 'ü' | 'û' => 'u',
        c => c,
    }
}

fn folded(lower: &[char]) -> String {
    lower.iter().map(|&c| fold(c)).collect()
}

fn is_common(word: &[char]) -> bool {
    static FOLDED: std::sync::OnceLock<std::collections::HashSet<String>> = std::sync::OnceLock::new();
    let set = FOLDED.get_or_init(|| COMMON_WORDS.iter().map(|w| folded(&lower(w))).collect());
    set.contains(&folded(word))
}

fn best_match<'a>(word: &str, dictionary: &[(Vec<char>, &'a str)]) -> Option<&'a str> {
    let letters = word.chars().count();
    if letters <= MAX_UNTOUCHED_LEN {
        return None;
    }
    let w = lower(word);
    if is_common(&w) {
        return None;
    }
    let first = fold(w[0]);
    dictionary
        .iter()
        .filter(|(l, _)| l.first().map(|&c| fold(c)) == Some(first))
        .map(|(l, written)| (levenshtein(&w, l), *written))
        .filter(|(d, _)| *d as f64 / letters as f64 <= MAX_RELATIVE_DISTANCE)
        .min_by_key(|(d, _)| *d)
        .map(|(_, written)| written)
}

pub(crate) fn levenshtein(a: &[char], b: &[char]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        cur[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Replacement;

    fn cfg(dictionary: &[&str], replacements: &[(&str, &str)]) -> DictationCfg {
        DictationCfg {
            dictionary: dictionary.iter().map(|s| s.to_string()).collect(),
            replacements: replacements.iter().map(|(f, t)| Replacement { from: f.to_string(), to: t.to_string() }).collect(),
            ..DictationCfg::default()
        }
    }

    #[test]
    fn replacement_whole_word_case_insensitive() {
        let c = cfg(&[], &[("mi correo", "persona@ejemplo.com")]);
        assert_eq!(apply_dictation("Mi correo es este", &c), "persona@ejemplo.com es este");
        assert_eq!(apply_dictation("escribe a MI CORREO.", &c), "escribe a persona@ejemplo.com.");
        // Solo palabras completas.
        assert_eq!(apply_dictation("mi correoso amigo", &c), "mi correoso amigo");
        assert_eq!(apply_dictation("ami correo", &c), "ami correo");
    }

    #[test]
    fn replacement_text_is_not_touched_by_dictionary() {
        let c = cfg(&["Ana"], &[("firma", "ana ejemplo")]);
        assert_eq!(apply_dictation("firma", &c), "ana ejemplo");
    }

    #[test]
    fn dictionary_fixes_near_spelling() {
        let c = cfg(&["Lazolab", "LazoPad", "Mirador"], &[]);
        assert_eq!(apply_dictation("abre lazolap", &c), "abre Lazolab");
        assert_eq!(apply_dictation("reinicia el lazopad.", &c), "reinicia el LazoPad.");
        assert_eq!(apply_dictation("entra a frost hold", &c), "entra a frost hold");
        assert_eq!(apply_dictation("entra a mirador, ya", &c), "entra a Mirador, ya");
        // Demasiado lejos: se queda.
        assert_eq!(apply_dictation("abre absoluto", &c), "abre absoluto");
    }

    #[test]
    fn short_words_need_distance_one() {
        let c = cfg(&["Jira"], &[]);
        assert_eq!(apply_dictation("abre jara", &c), "abre Jira");
        assert_eq!(apply_dictation("abre jaro", &c), "abre jaro");
        // Distancia relativa > 0,25: se queda.
        let c = cfg(&["Tauri"], &[]);
        assert_eq!(apply_dictation("usa toari", &c), "usa toari");
    }

    #[test]
    fn different_first_letter_is_never_corrected() {
        let c = cfg(&["Jira"], &[]);
        assert_eq!(apply_dictation("mira esto", &c), "mira esto");
        // Primera letra igual sin importar mayúsculas ni acentos.
        let c = cfg(&["Órbita"], &[]);
        assert_eq!(apply_dictation("abre orbita", &c), "abre Órbita");
    }

    #[test]
    fn common_spanish_words_are_never_rewritten() {
        let c = cfg(&["Notion", "Nadia", "Girona", "Nodos"], &[]);
        assert_eq!(apply_dictation("no tengo noción", &c), "no tengo noción");
        assert_eq!(apply_dictation("la nación", &c), "la nación");
        assert_eq!(apply_dictation("gira y tira el nodo", &c), "gira y tira el nodo");
        assert_eq!(apply_dictation("nada", &c), "nada");
    }

    #[test]
    fn tiny_words_are_never_corrected() {
        let c = cfg(&["Ok", "Sol"], &[]);
        assert_eq!(apply_dictation("de la casa", &c), "de la casa");
        assert_eq!(apply_dictation("sal", &c), "sal");
    }

    #[test]
    fn empty_stays_empty() {
        let c = cfg(&["Lazolab"], &[("mi correo", "x@y.z")]);
        assert_eq!(apply_dictation("", &c), "");
        assert_eq!(apply_dictation("   ", &c), "");
        assert_eq!(apply_dictation("  hola  ", &c), "hola");
    }
}
