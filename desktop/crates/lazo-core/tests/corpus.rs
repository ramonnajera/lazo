use lazo_core::commands::{parse, Command, MediaOp, ParseResult, SystemOp, TargetKind, VolumeOp};
use lazo_core::config::{Alias, CommandsCfg};

fn cfg() -> CommandsCfg {
    let a = |n: &str, t: &str| Alias { name: n.into(), target: t.into() };
    CommandsCfg {
        sites: vec![
            a("youtube", "https://www.youtube.com"),
            a("google", "https://www.google.com"),
            a("gmail", "https://mail.google.com"),
        ],
        programs: vec![
            a("spotify", r"C:\Users\x\AppData\Roaming\Spotify\Spotify.exe"),
            a("vs code", r"C:\Users\x\AppData\Local\Programs\Code\Code.exe"),
            a("discord", r"C:\Users\x\AppData\Local\Discord\Discord.exe"),
        ],
        ..CommandsCfg::default()
    }
}

const SPOTIFY: &str = r"C:\Users\x\AppData\Roaming\Spotify\Spotify.exe";
const CODE: &str = r"C:\Users\x\AppData\Local\Programs\Code\Code.exe";
const DISCORD: &str = r"C:\Users\x\AppData\Local\Discord\Discord.exe";

fn url(s: &str) -> ParseResult { ParseResult::Command(Command::OpenUrl(s.into())) }
fn prog(s: &str) -> ParseResult { ParseResult::Command(Command::OpenProgram(s.into())) }
fn folder(s: &str) -> ParseResult { ParseResult::Command(Command::OpenFolder(s.into())) }
fn vol(v: VolumeOp) -> ParseResult { ParseResult::Command(Command::Volume(v)) }
fn media(m: MediaOp) -> ParseResult { ParseResult::Command(Command::Media(m)) }
fn sys(s: SystemOp) -> ParseResult { ParseResult::Command(Command::System(s)) }
fn nf(kind: TargetKind, t: &str) -> ParseResult { ParseResult::NotFound { kind, target: t.into() } }

#[test]
fn corpus() {
    let yt_search = |q: &str| url(&format!("https://www.youtube.com/results?search_query={q}"));
    let g_search = |q: &str| url(&format!("https://www.google.com/search?q={q}"));
    let cases: Vec<(&str, ParseResult)> = vec![
        ("Abre YouTube.", url("https://www.youtube.com")),
        ("Abre youtube", url("https://www.youtube.com")),
        ("Ábreme Gmail.", url("https://mail.google.com")),
        ("Abre el spotifai.", prog(SPOTIFY)),
        ("Eh, abre el Spotify, por favor.", prog(SPOTIFY)),
        ("Lanza vscode.", prog(CODE)),
        ("Abre Visual Studio Code", nf(TargetKind::Program, "visual studio code")),
        ("Ejecuta Discord.", prog(DISCORD)),
        ("Inicia el discord", prog(DISCORD)),
        ("Abre descargas.", folder(r"%USERPROFILE%\Downloads")),
        ("Abre la carpeta de documentos.", folder(r"%USERPROFILE%\Documents")),
        ("Abre mi escritorio", folder(r"%USERPROFILE%\Desktop")),
        ("Entra a youtube", url("https://www.youtube.com")),
        ("Ve a google.", url("https://www.google.com")),
        ("Abre la página de gmail", url("https://mail.google.com")),
        ("Abre photoshop.", nf(TargetKind::Program, "photoshop")),
        ("Abre la carpeta de fotos", nf(TargetKind::Folder, "fotos")),
        ("Abre el sitio de reddit", nf(TargetKind::Site, "reddit")),
        ("Busca lo fi en yutub.", yt_search("lo+fi")),
        ("Busca clima chihuahua.", g_search("clima+chihuahua")),
        ("Búscame recetas de pozole en google", g_search("recetas+de+pozole")),
        ("Pon daft punk en youtube.", yt_search("daft+punk")),
        ("Busca gatos en youtube", yt_search("gatos")),
        ("Oye, busca cafeterías cerca", g_search("cafeter%C3%ADas+cerca")),
        ("Volumen al treinta.", vol(VolumeOp::Set(30))),
        ("Volumen al 45 por ciento", vol(VolumeOp::Set(45))),
        ("Volumen treinta y cinco", vol(VolumeOp::Set(35))),
        ("Volumen al cien por ciento.", vol(VolumeOp::Set(100))),
        ("Volumen a 120", ParseResult::NotACommand),
        ("Sube el volumen.", vol(VolumeOp::Up)),
        ("Sube volumen", vol(VolumeOp::Up)),
        ("Baja el volumen, por favor.", vol(VolumeOp::Down)),
        ("Silencio.", vol(VolumeOp::Mute)),
        ("Mutea", vol(VolumeOp::Mute)),
        ("Quita el sonido", vol(VolumeOp::Mute)),
        ("Pausa.", media(MediaOp::Pause)),
        ("Deten la música", media(MediaOp::Pause)),
        ("Dale play.", media(MediaOp::Play)),
        ("Reanuda", media(MediaOp::Play)),
        ("Siguiente canción.", media(MediaOp::Next)),
        ("La que sigue.", media(MediaOp::Next)),
        ("La anterior.", media(MediaOp::Previous)),
        ("Regresa la canción", media(MediaOp::Previous)),
        ("Pausa la música.", media(MediaOp::Pause)),
        ("Pausa la canción", media(MediaOp::Pause)),
        ("Reanuda la música.", media(MediaOp::Play)),
        ("Sube un poco el volumen.", vol(VolumeOp::Up)),
        ("Baja un poco el volumen", vol(VolumeOp::Down)),
        ("Bloquea la compu.", sys(SystemOp::Lock)),
        ("Bloquea la pantalla", sys(SystemOp::Lock)),
        ("Suspende la computadora", sys(SystemOp::Sleep)),
        ("Apaga la computadora.", sys(SystemOp::Shutdown)),
        ("Recuérdame pagar el internet el viernes.", ParseResult::NotACommand),
        ("¿Cuánto me debe Juan?", ParseResult::NotACommand),
        ("Abre.", ParseResult::NotACommand),
        ("Busca C++ en google.", g_search("C%2B%2B")),
        ("Pon el volumen al treinta.", vol(VolumeOp::Set(30))),
        ("Pon silencio.", vol(VolumeOp::Mute)),
        ("Pon pausa.", media(MediaOp::Pause)),
        ("Pon la siguiente.", media(MediaOp::Next)),
        ("Pon play.", media(MediaOp::Play)),
        ("Volumen a cincuenta.", vol(VolumeOp::Set(50))),
        ("Busca en mis correos lo de Juan.", ParseResult::NotACommand),
        ("Busca mi cita con el doctor.", ParseResult::NotACommand),
        ("Abre youtube y busca gatos.", ParseResult::NotACommand),
        ("Ve a comprar leche.", ParseResult::NotACommand),
        ("Inicia sesión en el banco.", ParseResult::NotACommand),
        ("Lanza un recordatorio.", ParseResult::NotACommand),
        ("Ejecuta el respaldo.", ParseResult::NotACommand),
        ("Abre mi correo.", ParseResult::NotACommand),
        ("Abre la lista de cuentas.", ParseResult::NotACommand),
        ("Abre una nota para mañana.", ParseResult::NotACommand),
        ("Abre el programa que me mandaron ayer.", ParseResult::NotACommand),
        ("Lanza photoshop.", ParseResult::NotACommand),
        ("Hola, ¿cómo estás?", ParseResult::NotACommand),
        ("Abre youtube y luego busca un video de gatos que me mandó mi hermano ayer", ParseResult::NotACommand),
    ];
    assert!(cases.len() >= 40);
    let c = cfg();
    let mut failures = vec![];
    for (text, want) in cases {
        let got = parse(text, &c);
        if got != want {
            failures.push(format!("{text:?}: got {got:?}, want {want:?}"));
        }
    }
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}

#[test]
fn system_disabled_is_not_a_command() {
    let mut c = cfg();
    c.system_enabled = false;
    for t in ["Bloquea la compu.", "Apaga la computadora", "Suspende la pc"] {
        assert_eq!(parse(t, &c), ParseResult::NotACommand, "{t}");
    }
}
