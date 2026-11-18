// Adapted from coucou (https://github.com/Louis-CFM/coucou), MIT License, Copyright (c) Louis Raillé
//! Pegado del dictado: se guarda una copia de TODO el portapapeles (texto, RTF, HTML, imágenes
//! DIB, archivos copiados…), el texto va al portapapeles fuera del historial y de la nube,
//! Ctrl+V en el programa activo, y 700 ms después vuelve lo que había (vacío si estaba vacío),
//! salvo que algo más se haya copiado mientras tanto.
//!
//! Bloquea: lo llama el hilo de pegado de `voice.rs`, uno a la vez y en orden.
//!
//! La copia corre en un hilo auxiliar con un tope de [`SNAPSHOT_BUDGET`]: un programa que ofrece
//! formatos "diferidos" (los genera al pedirlos) y no responde colgaría `GetClipboardData`. Si se
//! pasa del tope, ese pegado no guarda ni restaura nada (el texto se pega igual) y queda en el log.
//!
//! Si el portapapeles no se deja escribir (otro programa, o la copia abandonada, lo tiene
//! abierto), el texto se escribe tecla por tecla con `KEYEVENTF_UNICODE`: el dictado no se pierde.

use std::time::{Duration, Instant};

use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData, GetClipboardSequenceNumber, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP,
    KEYEVENTF_UNICODE, SendInput, VIRTUAL_KEY,
};
use windows::core::{PCWSTR, w};

const VK_CONTROL: u16 = 0x11;
const VK_V: u16 = 0x56;
const VK_RETURN: u16 = 0x0D;
const VK_SHIFT: u16 = 0x10;
/// Teclas por llamada a `SendInput` al escribir el texto, y pausa entre tandas para que el
/// programa activo no pierda caracteres.
const TYPE_BATCH: usize = 64;
const TYPE_PAUSE: Duration = Duration::from_millis(8);
/// Modificadores que convertirían Ctrl+V en otra cosa (Ctrl+Alt+V, Ctrl+Shift+V, Win+V…).
const HELD_MODIFIERS: [i32; 8] = [0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x5B, 0x5C];
const RESTORE_AFTER: Duration = Duration::from_millis(700);
const CF_UNICODETEXT: u32 = 13;
const SNAPSHOT_BUDGET: Duration = Duration::from_millis(1500);
/// Intentos de 10 ms para abrir el portapapeles (normal / tras abandonar una copia colgada,
/// cuyo hilo aún puede tenerlo abierto un rato).
const OPEN_TRIES: u32 = 25;
const OPEN_TRIES_AFTER_TIMEOUT: u32 = 300;

/// Lo que había en el portapapeles: (formato, bytes del HGLOBAL).
pub type Snapshot = Vec<(u32, Vec<u8>)>;

/// Formatos cuyo contenido es un HGLOBAL que se puede copiar byte a byte. Los de GDI
/// (CF_BITMAP, CF_ENHMETAFILE, CF_METAFILEPICT, CF_PALETTE), los de dibujo del dueño y los
/// privados son handles, no memoria: se saltan (CF_DIB/CF_DIBV5 ya llevan la imagen).
pub fn byte_copyable(format: u32) -> bool {
    !matches!(format, 2 | 3 | 9 | 14 | 0x80 | 0x82 | 0x83 | 0x8E | 0x0200..=0x03FF)
}

/// El portapapeles abierto; se cierra al soltarlo. Sin ventana dueña (como arboard): un
/// dueño en un hilo que no atiende mensajes colgaría a quien vacíe el portapapeles.
struct Open;

impl Open {
    fn new() -> Result<Open, String> {
        Self::with_tries(OPEN_TRIES)
    }

    fn with_tries(tries: u32) -> Result<Open, String> {
        // Otro programa puede tenerlo abierto un instante.
        for _ in 0..tries {
            if unsafe { OpenClipboard(None) }.is_ok() {
                return Ok(Open);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        Err("No se pudo abrir el portapapeles".into())
    }
}

impl Drop for Open {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

fn read_global(h: HGLOBAL) -> Option<Vec<u8>> {
    unsafe {
        let size = GlobalSize(h);
        if size == 0 {
            return None;
        }
        let p = GlobalLock(h) as *const u8;
        if p.is_null() {
            return None;
        }
        let bytes = std::slice::from_raw_parts(p, size).to_vec();
        let _ = GlobalUnlock(h);
        Some(bytes)
    }
}

fn put(format: u32, bytes: &[u8]) -> bool {
    unsafe {
        let Ok(h) = GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1)) else { return false };
        let p = GlobalLock(h) as *mut u8;
        if p.is_null() {
            let _ = GlobalFree(Some(h));
            return false;
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, bytes.len());
        let _ = GlobalUnlock(h);
        // Con éxito, el sistema pasa a ser dueño de la memoria.
        if SetClipboardData(format, Some(HANDLE(h.0))).is_err() {
            let _ = GlobalFree(Some(h));
            return false;
        }
        true
    }
}

/// Copia todos los formatos que se pueden copiar.
pub fn snapshot() -> Result<Snapshot, String> {
    let _open = Open::new()?;
    let mut out = Vec::new();
    let mut format = 0;
    loop {
        format = unsafe { EnumClipboardFormats(format) };
        if format == 0 {
            break;
        }
        if !byte_copyable(format) {
            continue;
        }
        if let Ok(h) = unsafe { GetClipboardData(format) }
            && let Some(bytes) = read_global(HGLOBAL(h.0))
        {
            out.push((format, bytes));
        }
    }
    Ok(out)
}

/// Resultado de copiar el portapapeles con tope de tiempo.
enum Budgeted {
    Done(Result<Snapshot, String>),
    TimedOut,
}

fn snapshot_within(budget: Duration) -> Budgeted {
    let (tx, rx) = std::sync::mpsc::channel();
    let spawned = std::thread::Builder::new().name("lazo-clip-snapshot".into()).spawn(move || {
        let _ = tx.send(snapshot());
    });
    if let Err(e) = spawned {
        return Budgeted::Done(Err(format!("no se pudo copiar el portapapeles: {e}")));
    }
    match rx.recv_timeout(budget) {
        Ok(r) => Budgeted::Done(r),
        // El hilo queda suelto: cuando termine cierra el portapapeles y su resultado se descarta.
        Err(_) => Budgeted::TimedOut,
    }
}

/// Vacía el portapapeles y deja exactamente `items` (vacío si no hay ninguno).
pub fn write_all(items: &[(u32, Vec<u8>)]) -> Result<(), String> {
    write_all_tries(items, OPEN_TRIES)
}

fn write_all_tries(items: &[(u32, Vec<u8>)], tries: u32) -> Result<(), String> {
    let _open = Open::with_tries(tries)?;
    unsafe { EmptyClipboard() }.map_err(|e| format!("No se pudo vaciar el portapapeles: {e}"))?;
    for (format, bytes) in items {
        put(*format, bytes);
    }
    Ok(())
}

/// Deja `text` en el portapapeles (normal, con historial). Espera más que el pegado: lo pide
/// el usuario y el portapapeles pudo estar ocupado hace un momento.
pub fn copy_text(text: &str) -> Result<(), String> {
    write_all_tries(&[(CF_UNICODETEXT, utf16z(text))], OPEN_TRIES_AFTER_TIMEOUT)
}

fn register(name: PCWSTR) -> u32 {
    unsafe { RegisterClipboardFormatW(name) }
}

/// Marcas para que el historial de Win+V y el portapapeles en la nube no lo guarden.
fn private_marks() -> Vec<(u32, Vec<u8>)> {
    vec![
        (register(w!("ExcludeClipboardContentFromMonitorProcessing")), vec![0]),
        (register(w!("CanIncludeInClipboardHistory")), 0u32.to_le_bytes().to_vec()),
        (register(w!("CanUploadToCloudClipboard")), 0u32.to_le_bytes().to_vec()),
    ]
}

fn utf16z(text: &str) -> Vec<u8> {
    text.encode_utf16().chain(std::iter::once(0)).flat_map(u16::to_le_bytes).collect()
}

/// Espera (hasta 1 s) a que se suelten los modificadores, así el pegado es un Ctrl+V limpio.
fn wait_modifiers_released() {
    let until = Instant::now() + Duration::from_secs(1);
    while Instant::now() < until {
        let held = HELD_MODIFIERS.iter().any(|&vk| unsafe { GetAsyncKeyState(vk) } as u16 & 0x8000 != 0);
        if !held {
            return;
        }
        std::thread::sleep(Duration::from_millis(15));
    }
}

fn input(vk: u16, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: scan,
                dwFlags: flags,
                time: 0,
                // El gancho de teclado no las toma por teclas del usuario.
                dwExtraInfo: crate::keyboard_hook::INJECTED_MARK,
            },
        },
    }
}

fn key_input(vk: u16, up: bool) -> INPUT {
    input(vk, 0, if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) })
}

fn unicode_input(unit: u16, up: bool) -> INPUT {
    input(0, unit, if up { KEYEVENTF_UNICODE | KEYEVENTF_KEYUP } else { KEYEVENTF_UNICODE })
}

/// Teclas para escribir `text`, agrupadas por carácter (un grupo nunca se parte entre dos
/// `SendInput`). Salto de línea (`\n`, `\r\n` o `\r`) = Shift+Enter (un chat o un formulario
/// no envía a medio dictado); un carácter fuera del BMP va
/// como par sustituto: las dos mitades abajo y luego las dos arriba.
pub fn type_inputs(text: &str) -> Vec<Vec<INPUT>> {
    let mut out = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\r' | '\n' => {
                if c == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                out.push(vec![
                    key_input(VK_SHIFT, false),
                    key_input(VK_RETURN, false),
                    key_input(VK_RETURN, true),
                    key_input(VK_SHIFT, true),
                ]);
            }
            _ => {
                let mut buf = [0u16; 2];
                let units = c.encode_utf16(&mut buf);
                let mut group: Vec<INPUT> = units.iter().map(|&u| unicode_input(u, false)).collect();
                group.extend(units.iter().map(|&u| unicode_input(u, true)));
                out.push(group);
            }
        }
    }
    out
}

/// Escribe `text` donde está el cursor, sin tocar el portapapeles.
pub fn type_text(text: &str) -> Result<(), String> {
    let groups = type_inputs(text);
    let mut batch: Vec<INPUT> = Vec::with_capacity(TYPE_BATCH + 4);
    let mut iter = groups.into_iter().peekable();
    while let Some(g) = iter.next() {
        batch.extend(g);
        let last = iter.peek().is_none();
        if batch.len() >= TYPE_BATCH || last {
            let sent = unsafe { SendInput(&batch, std::mem::size_of::<INPUT>() as i32) };
            if sent as usize != batch.len() {
                return Err("Windows rechazó las teclas del dictado".into());
            }
            batch.clear();
            if !last {
                std::thread::sleep(TYPE_PAUSE);
            }
        }
    }
    Ok(())
}

fn send_ctrl_v() -> Result<(), String> {
    let inputs = [key_input(VK_CONTROL, false), key_input(VK_V, false), key_input(VK_V, true), key_input(VK_CONTROL, true)];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() { Ok(()) } else { Err("Windows rechazó el Ctrl+V; el texto quedó en el portapapeles".into()) }
}

/// Pega `text` donde está el cursor. Con `restore`, 700 ms después el portapapeles vuelve a
/// tener todo lo que tenía antes. Bloquea hasta terminar (incluida la restauración).
pub fn paste_text(text: &str, restore: bool) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }
    // Si no se pudo copiar lo anterior, mejor no "restaurar" nada que lo borre.
    let mut tries = OPEN_TRIES;
    let previous = if !restore {
        None
    } else {
        match snapshot_within(SNAPSHOT_BUDGET) {
            Budgeted::Done(r) => r.map_err(|e| eprintln!("paste: {e}")).ok(),
            Budgeted::TimedOut => {
                eprintln!("paste: copiar el portapapeles tardó más de {SNAPSHOT_BUDGET:?}; se pega sin guardar ni restaurar");
                tries = OPEN_TRIES_AFTER_TIMEOUT;
                None
            }
        }
    };

    let mut ours = vec![(CF_UNICODETEXT, utf16z(text))];
    ours.extend(private_marks());
    if let Err(e) = write_all_tries(&ours, tries) {
        eprintln!("paste: {e}; se escribe tecla por tecla");
        wait_modifiers_released();
        return type_text(text);
    }
    let seq = unsafe { GetClipboardSequenceNumber() };

    wait_modifiers_released();
    // Un momento para que el portapapeles se anuncie antes de que el programa lo lea.
    std::thread::sleep(Duration::from_millis(40));
    send_ctrl_v()?;

    if let Some(mut previous) = previous {
        std::thread::sleep(RESTORE_AFTER);
        // Algo más se copió mientras tanto: se respeta.
        if unsafe { GetClipboardSequenceNumber() } == seq {
            if !previous.is_empty() {
                // La restauración no repite la entrada en el historial de Win+V.
                for mark in private_marks().into_iter().skip(1) {
                    if !previous.iter().any(|(f, _)| *f == mark.0) {
                        previous.push(mark);
                    }
                }
            }
            // El texto ya se pegó: un fallo aquí solo queda en el log.
            if let Err(e) = write_all(&previous) {
                eprintln!("paste: no se pudo restaurar el portapapeles: {e}");
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gdi_and_private_formats_are_skipped() {
        for f in [2, 3, 9, 14, 0x80, 0x82, 0x83, 0x8E, 0x200, 0x2FF, 0x300, 0x3FF] {
            assert!(!byte_copyable(f), "{f:#x}");
        }
        // CF_TEXT, CF_DIB, CF_UNICODETEXT, CF_HDROP, CF_LOCALE, CF_DIBV5 y los registrados (HTML, RTF).
        for f in [1, 8, 13, 15, 16, 17, 0xC000, 0xC1A5] {
            assert!(byte_copyable(f), "{f:#x}");
        }
    }

    #[test]
    fn utf16_has_terminator() {
        assert_eq!(utf16z("añ"), vec![b'a', 0, 0xF1, 0, 0, 0]);
    }

    fn ki(i: &INPUT) -> (u16, u16, u32, usize) {
        let k = unsafe { i.Anonymous.ki };
        (k.wVk.0, k.wScan, k.dwFlags.0, k.dwExtraInfo)
    }

    const U: u32 = KEYEVENTF_UNICODE.0;
    const UP: u32 = KEYEVENTF_KEYUP.0;

    #[test]
    fn typing_bmp_chars_is_unicode_down_up() {
        let g = type_inputs("añ");
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].iter().map(ki).collect::<Vec<_>>(), vec![(0, 'a' as u16, U, crate::keyboard_hook::INJECTED_MARK), (0, 'a' as u16, U | UP, crate::keyboard_hook::INJECTED_MARK)]);
        assert_eq!(ki(&g[1][0]).1, 0xF1);
    }

    #[test]
    fn typing_surrogate_pair_keeps_both_halves_together() {
        // U+1F600 = D83D DE00.
        let g = type_inputs("😀");
        assert_eq!(g.len(), 1);
        let keys: Vec<_> = g[0].iter().map(|i| (ki(i).1, ki(i).2)).collect();
        assert_eq!(keys, vec![(0xD83D, U), (0xDE00, U), (0xD83D, U | UP), (0xDE00, U | UP)]);
    }

    #[test]
    fn typing_newlines_are_shift_enter() {
        let g = type_inputs("a\nb\r\nc\rd");
        assert_eq!(g.len(), 7);
        for i in [1, 3, 5] {
            let keys: Vec<_> = g[i].iter().map(|k| (ki(k).0, ki(k).2)).collect();
            assert_eq!(keys, vec![(VK_SHIFT, 0), (VK_RETURN, 0), (VK_RETURN, UP), (VK_SHIFT, UP)], "grupo {i}");
        }
        assert!(type_inputs("").is_empty());
    }

    /// Toca el portapapeles real (lo deja como estaba): `cargo test -- --ignored clipboard`.
    #[test]
    #[ignore]
    fn clipboard_snapshot_roundtrip() {
        let original = snapshot().unwrap();
        let html = register(w!("HTML Format"));
        let items = vec![(CF_UNICODETEXT, utf16z("hola")), (html, b"<b>hola</b>\0".to_vec())];
        write_all(&items).unwrap();
        let got = snapshot().unwrap();
        assert!(got.iter().any(|(f, b)| *f == CF_UNICODETEXT && b.starts_with(&utf16z("hola"))));
        assert!(got.iter().any(|(f, b)| *f == html && b.starts_with(b"<b>hola</b>")));
        write_all(&[]).unwrap();
        assert!(snapshot().unwrap().is_empty());
        write_all(&original).unwrap();
    }
}
