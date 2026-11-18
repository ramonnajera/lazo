//! Geometría de la isla: centrada horizontalmente en el borde superior del monitor.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// Alto físico útil desde el borde superior del monitor hasta el final del área de trabajo
    /// (sin la barra de tareas de abajo).
    pub work_height: u32,
    pub scale: f64,
}

/// Margen lógico que la isla deja libre abajo cuando el estado pide más alto del que cabe.
pub const BOTTOM_MARGIN: f64 = 24.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// Rectángulo físico de la isla para un tamaño lógico dado. Nunca más alta que el área de
/// trabajo menos [`BOTTOM_MARGIN`]: los formularios se desplazan por dentro.
pub fn island_rect(monitor: MonitorInfo, size_logical: (f64, f64)) -> Rect {
    let w = (size_logical.0 * monitor.scale).round() as u32;
    let h = (size_logical.1 * monitor.scale).round() as u32;
    let usable = if monitor.work_height > 0 { monitor.work_height.min(monitor.height) } else { monitor.height };
    let max_h = (usable as f64 - BOTTOM_MARGIN * monitor.scale).round().max(1.0) as u32;
    let h = h.min(max_h);
    let offset = (monitor.width as i64 - w as i64) / 2;
    Rect { x: monitor.x + offset as i32, y: monitor.y, w, h }
}

/// Rectángulo lógico (px CSS) relativo a la esquina superior izquierda de la ventana.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LogicalRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Región física de la ventana para un rectángulo lógico: el origen se redondea hacia abajo y
/// el tamaño hacia arriba para no recortar bordes. Tolera el ruido de coma flotante.
pub fn region_to_physical(r: LogicalRect, scale: f64) -> Rect {
    const EPS: f64 = 1e-6;
    let down = |v: f64| (v * scale + EPS).floor();
    let up = |v: f64| (v * scale - EPS).ceil().max(0.0);
    Rect { x: down(r.x) as i32, y: down(r.y) as i32, w: up(r.w) as u32, h: up(r.h) as u32 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn island_rect_respects_scale_and_monitor_origin() {
        let m = MonitorInfo { x: 1920, y: 0, width: 2560, height: 1440, work_height: 1392, scale: 1.25 };
        let r = island_rect(m, (360.0, 44.0));
        assert_eq!((r.w, r.h), (450, 55));
        assert_eq!(r.x, 1920 + (2560 - 450) / 2);
        assert_eq!(r.y, 0);

        let p = MonitorInfo { x: 0, y: 0, width: 1920, height: 1080, work_height: 1032, scale: 1.0 };
        let r = island_rect(p, (360.0, 44.0));
        assert_eq!(r, Rect { x: 780, y: 0, w: 360, h: 44 });
    }

    #[test]
    fn island_height_clamped_to_work_area() {
        // 1366×768 con barra de tareas de 48 px: el formulario de 760 no cabe.
        let m = MonitorInfo { x: 0, y: 0, width: 1366, height: 768, work_height: 720, scale: 1.0 };
        assert_eq!(island_rect(m, (720.0, 760.0)).h, 720 - 24);
        assert_eq!(island_rect(m, (720.0, 480.0)).h, 480);
        // Con escala 1.5: 1080 físicos, área útil 1008 → máx. 1008 - 36.
        let m = MonitorInfo { x: 0, y: 0, width: 1920, height: 1080, work_height: 1008, scale: 1.5 };
        assert_eq!(island_rect(m, (720.0, 760.0)).h, 1008 - 36);
        assert_eq!(island_rect(m, (720.0, 480.0)).h, 720);
        // Sin dato del área de trabajo se usa el alto del monitor.
        let m = MonitorInfo { x: 0, y: 0, width: 1366, height: 768, work_height: 0, scale: 1.0 };
        assert_eq!(island_rect(m, (720.0, 760.0)).h, 768 - 24);
    }

    #[test]
    fn region_scales_logical_to_physical() {
        let strip = LogicalRect { x: 14.0, y: 0.0, w: 372.0, h: 4.0 };
        assert_eq!(region_to_physical(strip, 1.25), Rect { x: 17, y: 0, w: 465, h: 5 });
        assert_eq!(region_to_physical(strip, 1.5), Rect { x: 21, y: 0, w: 558, h: 6 });
        assert_eq!(region_to_physical(strip, 1.0), Rect { x: 14, y: 0, w: 372, h: 4 });
    }
}
