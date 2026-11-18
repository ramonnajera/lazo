//! Ventana de la isla: colocación en el monitor elegido y ventana de configuración.

use lazo_core::config::Config;
use lazo_core::geometry::{LogicalRect, MonitorInfo, island_rect, region_to_physical};
use std::sync::{Mutex, OnceLock};
use std::thread::ThreadId;
use std::sync::atomic::{AtomicIsize, Ordering};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, State, Window, WindowEvent};
use windows::Win32::Foundation::HWND;

pub const ISLAND: &str = "island";
pub const SETTINGS: &str = "settings";

/// Tamaño lógico fijo de la ventana de la isla: ningún cambio de estado la redimensiona; lo
/// visible se recorta con una región de Win32 (`set_island_region`).
pub const WIN_W: f64 = 400.0;
pub const WIN_H: f64 = 360.0;
/// Ancho lógico de la isla (todas las vistas) y alto de la franja escondida.
const STRIP_W: f64 = 372.0;
const STRIP_H: f64 = 4.0;

/// Franja escondida: 372 × 4 arriba al centro de la ventana.
pub const HIDDEN_STRIP: LogicalRect = LogicalRect { x: (WIN_W - STRIP_W) / 2.0, y: 0.0, w: STRIP_W, h: STRIP_H };

/// Última región lógica pedida por la interfaz (se vuelve a aplicar al recolocar la ventana).
pub struct IslandRegion(pub Mutex<LogicalRect>);

impl Default for IslandRegion {
    fn default() -> Self {
        Self(Mutex::new(HIDDEN_STRIP))
    }
}

/// `monitor` en la configuración es `"x,y"` (posición física); sin coincidencia se usa el principal.
fn pick_monitor(app: &AppHandle, pref: Option<&str>) -> Option<Monitor> {
    let monitors = app.available_monitors().unwrap_or_default();
    if let Some(p) = pref {
        if let Some(m) = monitors.iter().find(|m| format!("{},{}", m.position().x, m.position().y) == p) {
            return Some(m.clone());
        }
    }
    app.primary_monitor().ok().flatten().or_else(|| monitors.into_iter().next())
}

/// Coloca la ventana fija (400 × 360 lógicos) arriba al centro del monitor elegido y le vuelve a
/// aplicar la región vigente. Solo al arrancar y al cambiar la configuración: ningún estado de
/// la interfaz la mueve ni la redimensiona. Todo corre en el hilo principal para que mover,
/// redimensionar y recortar queden en orden; si Windows reescala la ventana después
/// (WM_DPICHANGED), `on_island_event` vuelve a aplicar la región con la escala nueva.
pub fn place_island(app: &AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        note_main_thread();
        let Some(win) = a.get_webview_window(ISLAND) else { return };
        let pref = a.state::<Mutex<Config>>().lock().unwrap_or_else(|e| e.into_inner()).general.monitor.clone();
        let Some(m) = pick_monitor(&a, pref.as_deref()) else { return };
        let work = m.work_area();
        let work_bottom = work.position.y as i64 + work.size.height as i64;
        let info = MonitorInfo {
            x: m.position().x,
            y: m.position().y,
            width: m.size().width,
            height: m.size().height,
            work_height: (work_bottom - m.position().y as i64).clamp(0, u32::MAX as i64) as u32,
            scale: m.scale_factor(),
        };
        let r = island_rect(info, (WIN_W, WIN_H));
        let _ = win.set_size(PhysicalSize::new(r.w, r.h));
        let _ = win.set_position(PhysicalPosition::new(r.x, r.y));
        apply_region(win.hwnd().ok(), current_region(&a), info.scale);
    });
}

/// Hilo principal (el del bucle de eventos), anotado desde código que corre en él.
static MAIN_THREAD: OnceLock<ThreadId> = OnceLock::new();

pub fn note_main_thread() {
    let _ = MAIN_THREAD.set(std::thread::current().id());
}

fn on_main_thread() -> bool {
    MAIN_THREAD.get() == Some(&std::thread::current().id())
}

fn current_region(app: &AppHandle) -> LogicalRect {
    *app.state::<IslandRegion>().0.lock().unwrap_or_else(|e| e.into_inner())
}

/// La isla cambió de escala (otro monitor o DPI) o de tamaño: la región física se recalcula
/// con la escala vigente.
pub fn on_island_event(win: &Window, event: &WindowEvent) {
    let scale = match event {
        WindowEvent::ScaleFactorChanged { scale_factor, .. } => *scale_factor,
        WindowEvent::Resized(_) => win.scale_factor().unwrap_or(1.0),
        _ => return,
    };
    note_main_thread();
    apply_region(win.hwnd().ok(), current_region(win.app_handle()), scale);
}

/// Recorta la ventana a `r` (lógico, relativo a la ventana). `w == 0 || h == 0` → región vacía:
/// no se ve nada y los clics pasan a lo de abajo. Windows toma posesión de la región si
/// `SetWindowRgn` tiene éxito; solo se libera si falla.
fn apply_region(hwnd: Option<HWND>, r: LogicalRect, scale: f64) {
    use windows::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn};
    let Some(hwnd) = hwnd else {
        eprintln!("región de la isla: no se obtuvo el HWND");
        return;
    };
    let p = region_to_physical(r, scale);
    let (x1, y1, x2, y2) =
        if p.w == 0 || p.h == 0 { (0, 0, 0, 0) } else { (p.x, p.y, p.x + p.w as i32, p.y + p.h as i32) };
    unsafe {
        let rgn = CreateRectRgn(x1, y1, x2, y2);
        if rgn.is_invalid() {
            eprintln!("región de la isla: CreateRectRgn falló ({x1},{y1})-({x2},{y2})");
            return;
        }
        if SetWindowRgn(hwnd, Some(rgn), true) == 0 {
            eprintln!("región de la isla: SetWindowRgn falló");
            let _ = DeleteObject(rgn.into());
        }
    }
}

/// La interfaz informa el rectángulo visible (lógico, relativo a la ventana). Los comandos
/// síncronos de Tauri corren en el hilo principal: ahí se aplica de inmediato, con la escala de ese
/// momento. Una recolocación que aún esté en cola vuelve a aplicar la región guardada al correr,
/// así que el orden se conserva. Si no se está en el hilo principal, se encola como antes.
#[tauri::command]
pub fn set_island_region(app: AppHandle, region: State<'_, IslandRegion>, x: f64, y: f64, w: f64, h: f64) {
    let rect = LogicalRect { x, y, w: w.max(0.0), h: h.max(0.0) };
    *region.0.lock().unwrap_or_else(|e| e.into_inner()) = rect;
    if on_main_thread() {
        if let Some(win) = app.get_webview_window(ISLAND) {
            apply_region(win.hwnd().ok(), rect, win.scale_factor().unwrap_or(1.0));
        }
        return;
    }
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(win) = a.get_webview_window(ISLAND) else { return };
        let scale = win.scale_factor().unwrap_or(1.0);
        apply_region(win.hwnd().ok(), current_region(&a), scale);
    });
}

pub fn show_settings(app: &AppHandle, section: Option<String>) {
    if let Some(win) = app.get_webview_window(SETTINGS) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        let _ = app.emit_to(SETTINGS, "settings-section", section);
    }
}

#[tauri::command]
pub fn open_settings(app: AppHandle, section: Option<String>) {
    show_settings(&app, section);
}

// --- Foco: la isla lo toma al abrirse por clic/atajo/formulario y lo devuelve al plegarse. ---

/// Ventana que tenía el foco antes de que la isla lo tomara (0 = ninguna).
static PREV_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

fn hwnd_of(app: &AppHandle, label: &str) -> isize {
    app.get_webview_window(label).and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize).unwrap_or(0)
}

/// Anota la ventana activa si no es de Lazo (la isla o Configuración).
fn note_foreground(app: &AppHandle) {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let fg = unsafe { GetForegroundWindow() }.0 as isize;
    if fg != 0 && fg != hwnd_of(app, ISLAND) && fg != hwnd_of(app, SETTINGS) {
        PREV_FOREGROUND.store(fg, Ordering::Relaxed);
    }
}

/// El ratón entró en la isla: si luego se hace clic, Windows le da el foco antes de que la
/// interfaz lo pida, así que la ventana anterior se anota ya.
#[tauri::command]
pub fn remember_foreground(app: AppHandle) {
    note_foreground(&app);
}

/// La isla se abre con foco (clic, bandeja, atajo, formulario).
#[tauri::command]
pub fn focus_island(app: AppHandle) {
    note_foreground(&app);
    if let Some(w) = app.get_webview_window(ISLAND) {
        let _ = w.set_focus();
    }
}

/// La isla se plegó (oculta o píldora): si sigue teniendo el foco, vuelve a la ventana anterior
/// (si aún existe). Si el usuario ya cambió de ventana, no se toca nada.
#[tauri::command]
pub fn restore_focus(app: AppHandle) {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsWindow, SetForegroundWindow};
    let island = hwnd_of(&app, ISLAND);
    if island == 0 {
        return;
    }
    unsafe {
        // Sin el foco no hay nada que devolver; lo anotado se conserva (p. ej. píldora → clic).
        if GetForegroundWindow().0 as isize != island {
            return;
        }
        let prev = PREV_FOREGROUND.swap(0, Ordering::Relaxed);
        if prev == 0 {
            return;
        }
        let target = HWND(prev as *mut core::ffi::c_void);
        if IsWindow(Some(target)).as_bool() {
            let _ = SetForegroundWindow(target);
        }
    }
}

#[cfg(test)]
mod main_thread_tests {
    use super::*;

    #[test]
    fn main_thread_is_the_noted_one() {
        note_main_thread();
        assert!(on_main_thread());
        assert!(!std::thread::spawn(on_main_thread).join().unwrap());
    }
}

/// ¿Está activado el registro de rendimiento? (variable de entorno `LAZO_PERF=1`; ver README.)
fn perf_mode_value() -> &'static str {
    static MODE: OnceLock<String> = OnceLock::new();
    MODE.get_or_init(|| std::env::var("LAZO_PERF").unwrap_or_default())
}

fn perf_on() -> bool {
    !perf_mode_value().is_empty() && perf_mode_value() != "0"
}

/// "" (apagado), "1" (marcas) o "tour" (marcas + recorrido de medición).
#[tauri::command]
pub fn perf_enabled() -> String {
    if perf_on() { perf_mode_value().to_string() } else { String::new() }
}

/// Añade una línea a `%TEMP%\lazo-perf.log` (solo con `LAZO_PERF=1`).
#[tauri::command]
pub fn perf_log(line: String) {
    if !perf_on() {
        return;
    }
    use std::io::Write;
    let path = std::env::temp_dir().join("lazo-perf.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{line}");
    }
}
