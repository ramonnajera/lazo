//! Prueba manual (Windows) de la región de la isla sobre la app en marcha.
//! Con Lazo corriendo y la isla escondida (`npm run tauri dev` o la instalada):
//! `cargo test -p lazo-desktop --test region_probe -- --ignored`
//!
//! Comprueba que la región de la ventana es la franja 372 × 4 (x = 14) en físico y que
//! `WindowFromPoint` dentro de la franja devuelve la isla, y a 200 px lógicos (dentro del
//! rectángulo de la ventana pero fuera de la región) devuelve otra ventana: el clic pasa.

use lazo_core::geometry::{LogicalRect, Rect, region_to_physical};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::{GetWindowRgnBox, SIMPLEREGION};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GA_ROOT, GetAncestor, GetWindowRect, GetWindowTextW, WindowFromPoint,
};
use windows::core::BOOL;

unsafe extern "system" fn find_island(h: HWND, out: LPARAM) -> BOOL {
    let mut buf = [0u16; 64];
    let n = unsafe { GetWindowTextW(h, &mut buf) } as usize;
    if String::from_utf16_lossy(&buf[..n]) == "Lazo" {
        unsafe { *(out.0 as *mut isize) = h.0 as isize };
        return false.into();
    }
    true.into()
}

#[test]
#[ignore]
fn hidden_island_region_clips_and_passes_clicks() {
    let mut found: isize = 0;
    unsafe {
        let _ = EnumWindows(Some(find_island), LPARAM(&mut found as *mut isize as isize));
    }
    assert_ne!(found, 0, "no se encontró la ventana «Lazo»: ¿está corriendo la app?");
    let island = HWND(found as *mut core::ffi::c_void);

    let mut win = RECT::default();
    let mut rgn = RECT::default();
    unsafe {
        GetWindowRect(island, &mut win).unwrap();
        assert_eq!(GetWindowRgnBox(island, &mut rgn), SIMPLEREGION, "la ventana no tiene región rectangular");
    }
    // Ventana fija de 400 lógicos de ancho: su ancho físico da la escala del monitor.
    let scale = (win.right - win.left) as f64 / 400.0;
    let want = region_to_physical(LogicalRect { x: 14.0, y: 0.0, w: 372.0, h: 4.0 }, scale);
    let got = Rect { x: rgn.left, y: rgn.top, w: (rgn.right - rgn.left) as u32, h: (rgn.bottom - rgn.top) as u32 };
    assert_eq!(got, want, "región física (escala {scale})");

    let root_at = |x: i32, y: i32| unsafe { GetAncestor(WindowFromPoint(POINT { x, y }), GA_ROOT) };
    let cx = (win.left + win.right) / 2;
    assert_eq!(root_at(cx, win.top + 1), island, "dentro de la franja debe estar la isla");
    let below = root_at(cx, win.top + (200.0 * scale) as i32);
    assert_ne!(below, island, "fuera de la región el clic debe pasar a otra ventana");
}
