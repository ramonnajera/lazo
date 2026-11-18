//! Máquina de teclas globales (sin nada del sistema operativo): mantener para grabar,
//! doble toque para manos libres, Esc para cancelar, AltGr como tecla de Lazo.

/// Ventana del doble toque: la segunda pulsación llega antes de esto desde la primera.
pub const DOUBLE_TAP_MS: u64 = 350;
/// AltGr: Windows envía un `LCtrl` falso justo antes de `RAlt`.
pub const ALTGR_WINDOW_MS: u64 = 5;

/// El micrófono se abre si la tecla sigue abajo tras esto (o al entrar en manos libres):
/// AltGr+Q o RCtrl+C no llegan a abrirlo.
pub const MIC_HOLD_MS: u64 = 150;

pub const VK_ESCAPE: u32 = 0x1B;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhysKey {
    LCtrl,
    RCtrl,
    LAlt,
    RAlt,
    LShift,
    RShift,
    LWin,
    Other(u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyEvent {
    pub key: PhysKey,
    pub down: bool,
    pub injected: bool,
    pub t_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Binding {
    RightCtrl,
    RightAlt,
    RightShift,
    CtrlWin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Dictation,
    Lazo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Start(Mode),
    Stop(Mode),
    Cancel,
    None,
}

impl Binding {
    pub const ALL: [Binding; 4] = [Binding::RightCtrl, Binding::RightAlt, Binding::RightShift, Binding::CtrlWin];

    /// Lee el valor de `Keys.dictation` / `Keys.lazo`.
    pub fn parse(s: &str) -> Option<Binding> {
        Binding::ALL.into_iter().find(|b| b.as_str() == s.trim())
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Binding::RightCtrl => "RightCtrl",
            Binding::RightAlt => "RightAlt",
            Binding::RightShift => "RightShift",
            Binding::CtrlWin => "CtrlWin",
        }
    }
}

/// Milisegundos de `then` a `now` con el reloj de 32 bits de Windows (`GetTickCount`,
/// `KBDLLHOOKSTRUCT::time`), que da la vuelta cada ~49 días.
fn elapsed(then: u64, now: u64) -> u64 {
    (now as u32).wrapping_sub(then as u32) as u64
}

/// Teclas que nunca cuentan como "otra tecla" (atajo): modificadores sueltos y Bloq Mayús.
fn is_modifier(key: PhysKey) -> bool {
    match key {
        PhysKey::Other(vk) => matches!(vk, 0x10 | 0x11 | 0x12 | 0x14 | 0x5C | 0xFC),
        _ => true,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Idle,
    /// Tecla mantenida desde `since`.
    Holding { mode: Mode, since: u64 },
    /// Primera pulsación corta (en `first_down`); sigue grabando a la espera del segundo toque.
    TapWait { mode: Mode, first_down: u64 },
    /// Manos libres hasta el siguiente toque.
    HandsFree { mode: Mode },
}

impl Phase {
    fn mode(self) -> Option<Mode> {
        match self {
            Phase::Idle => None,
            Phase::Holding { mode, .. } | Phase::TapWait { mode, .. } | Phase::HandsFree { mode } => Some(mode),
        }
    }
}

/// Estado físico de los modificadores que pueden ser teclas de grabación.
#[derive(Debug, Default, Clone, Copy)]
struct Held {
    lctrl: bool,
    rctrl: bool,
    ralt: bool,
    rshift: bool,
    lwin: bool,
    /// Momento del último `LCtrl` abajo (para detectar AltGr).
    lctrl_t: u64,
    /// El `LCtrl` abajo es el falso de AltGr: no cuenta y su key-up se ignora.
    phantom_lctrl: bool,
}

impl Held {
    fn binding(&self, b: Binding) -> bool {
        match b {
            Binding::RightCtrl => self.rctrl,
            Binding::RightAlt => self.ralt,
            Binding::RightShift => self.rshift,
            Binding::CtrlWin => self.lctrl && self.lwin,
        }
    }

    fn apply(&mut self, e: &KeyEvent) {
        match e.key {
            PhysKey::LCtrl => {
                if e.down {
                    // Repetición del LCtrl falso mientras AltGr sigue abajo.
                    if self.phantom_lctrl {
                        return;
                    }
                    if !self.lctrl {
                        self.lctrl_t = e.t_ms;
                    }
                    self.lctrl = true;
                } else {
                    self.lctrl = false;
                    self.phantom_lctrl = false;
                }
            }
            PhysKey::RAlt => {
                if e.down && self.lctrl && elapsed(self.lctrl_t, e.t_ms) <= ALTGR_WINDOW_MS {
                    self.lctrl = false;
                    self.phantom_lctrl = true;
                }
                self.ralt = e.down;
            }
            PhysKey::RCtrl => self.rctrl = e.down,
            PhysKey::RShift => self.rshift = e.down,
            PhysKey::LWin => self.lwin = e.down,
            PhysKey::LAlt | PhysKey::LShift | PhysKey::Other(_) => {}
        }
    }
}

pub struct HotkeyMachine {
    dictation: Binding,
    lazo: Binding,
    double_tap: bool,
    phase: Phase,
    held: Held,
}

impl HotkeyMachine {
    pub fn new(dictation: Binding, lazo: Binding, double_tap: bool) -> Self {
        Self { dictation, lazo, double_tap, phase: Phase::Idle, held: Held::default() }
    }

    /// Cambia las teclas sin perder qué está físicamente abajo. Si no cambió nada, la
    /// grabación en curso sigue; si cambió, se suelta y devuelve `true` si había una.
    pub fn reconfigure(&mut self, dictation: Binding, lazo: Binding, double_tap: bool) -> bool {
        if (self.dictation, self.lazo, self.double_tap) == (dictation, lazo, double_tap) {
            return false;
        }
        self.dictation = dictation;
        self.lazo = lazo;
        self.double_tap = double_tap;
        let was = self.phase != Phase::Idle;
        self.phase = Phase::Idle;
        was
    }

    /// ¿Ya toca abrir el micrófono? Tecla mantenida ≥ [`MIC_HOLD_MS`] o manos libres.
    pub fn should_open_mic(&self, t: u64) -> bool {
        match self.phase {
            Phase::Holding { since, .. } => elapsed(since, t) >= MIC_HOLD_MS,
            Phase::HandsFree { .. } => true,
            _ => false,
        }
    }

    /// Modo que está grabando, si alguno.
    pub fn active(&self) -> Option<Mode> {
        self.phase.mode()
    }

    pub fn is_hands_free(&self) -> bool {
        matches!(self.phase, Phase::HandsFree { .. })
    }

    /// La grabación terminó sola (sin micrófono, tope de 120 s, error).
    pub fn reset(&mut self) {
        self.phase = Phase::Idle;
    }

    /// Llamar seguido (cada ~20 ms): vence la espera del doble toque.
    pub fn tick(&mut self, t: u64) -> Action {
        match self.phase {
            Phase::TapWait { first_down, .. } if elapsed(first_down, t) >= DOUBLE_TAP_MS => {
                self.phase = Phase::Idle;
                Action::Cancel
            }
            _ => Action::None,
        }
    }

    pub fn on_event(&mut self, e: KeyEvent) -> Action {
        // Nuestro Ctrl+V y las teclas sintéticas de otros programas no son del usuario.
        if e.injected {
            return Action::None;
        }
        let before = (self.held.binding(self.dictation), self.held.binding(self.lazo));
        self.held.apply(&e);
        let after = (self.held.binding(self.dictation), self.held.binding(self.lazo));

        if let PhysKey::Other(vk) = e.key {
            if !e.down {
                return Action::None;
            }
            let recording = self.phase != Phase::Idle;
            if vk == VK_ESCAPE && recording {
                self.phase = Phase::Idle;
                return Action::Cancel;
            }
            // Otra tecla mientras se mantiene (o entre los dos toques): era un atajo.
            if !is_modifier(e.key) && matches!(self.phase, Phase::Holding { .. } | Phase::TapWait { .. }) {
                self.phase = Phase::Idle;
                return Action::Cancel;
            }
            return Action::None;
        }

        for (mode, was, is) in [(Mode::Dictation, before.0, after.0), (Mode::Lazo, before.1, after.1)] {
            let action = match (was, is) {
                (false, true) => self.pressed(mode, e.t_ms),
                (true, false) => self.released(mode, e.t_ms),
                _ => Action::None,
            };
            if action != Action::None {
                return action;
            }
        }
        Action::None
    }

    fn pressed(&mut self, mode: Mode, t: u64) -> Action {
        match self.phase {
            Phase::Idle => {
                self.phase = Phase::Holding { mode, since: t };
                Action::Start(mode)
            }
            Phase::TapWait { mode: m, first_down } if m == mode => {
                self.phase = if elapsed(first_down, t) < DOUBLE_TAP_MS {
                    Phase::HandsFree { mode }
                } else {
                    // Llegó tarde: la grabación sigue, ahora como pulsación mantenida.
                    Phase::Holding { mode, since: t }
                };
                Action::None
            }
            Phase::HandsFree { mode: m } if m == mode => {
                self.phase = Phase::Idle;
                Action::Stop(mode)
            }
            // La otra tecla durante una grabación no hace nada.
            _ => Action::None,
        }
    }

    fn released(&mut self, mode: Mode, t: u64) -> Action {
        match self.phase {
            Phase::Holding { mode: m, since } if m == mode => {
                if self.double_tap && elapsed(since, t) < DOUBLE_TAP_MS {
                    self.phase = Phase::TapWait { mode, first_down: since };
                    Action::None
                } else {
                    self.phase = Phase::Idle;
                    Action::Stop(mode)
                }
            }
            _ => Action::None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(key: PhysKey, down: bool, t_ms: u64) -> KeyEvent {
        KeyEvent { key, down, injected: false, t_ms }
    }
    fn machine(double_tap: bool) -> HotkeyMachine {
        HotkeyMachine::new(Binding::RightCtrl, Binding::RightAlt, double_tap)
    }

    #[test]
    fn hold_starts_and_release_stops() {
        let mut m = machine(true);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 0)), Action::Start(Mode::Dictation));
        // Autorrepetición del teclado mientras se mantiene.
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 500)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 530)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 1200)), Action::Stop(Mode::Dictation));
        assert_eq!(m.active(), None);
        // Lazo igual.
        assert_eq!(m.on_event(ev(PhysKey::RAlt, true, 2000)), Action::Start(Mode::Lazo));
        assert_eq!(m.on_event(ev(PhysKey::RAlt, false, 3000)), Action::Stop(Mode::Lazo));
    }

    #[test]
    fn short_press_without_double_tap_still_stops() {
        let mut m = machine(false);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 0)), Action::Start(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 100)), Action::Stop(Mode::Dictation));
    }

    #[test]
    fn double_tap_enters_hands_free_and_tap_stops() {
        let mut m = machine(true);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 0)), Action::Start(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 80)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 200)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 260)), Action::None);
        assert!(m.is_hands_free());
        assert_eq!(m.tick(10_000), Action::None);
        // Escribir en manos libres no corta.
        assert_eq!(m.on_event(ev(PhysKey::Other(0x41), true, 5000)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 9000)), Action::Stop(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 9080)), Action::None);
        assert_eq!(m.active(), None);
    }

    #[test]
    fn lone_tap_is_cancelled_when_window_runs_out() {
        let mut m = machine(true);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 0)), Action::Start(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 100)), Action::None);
        assert_eq!(m.tick(300), Action::None);
        assert_eq!(m.tick(351), Action::Cancel);
        assert_eq!(m.active(), None);
    }

    #[test]
    fn slow_second_press_is_a_new_hold_not_hands_free() {
        let mut m = machine(true);
        m.on_event(ev(PhysKey::RCtrl, true, 0));
        m.on_event(ev(PhysKey::RCtrl, false, 100));
        // Llega tarde (sin tick de por medio): sigue grabando como una pulsación mantenida.
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 400)), Action::None);
        assert!(!m.is_hands_free());
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 1400)), Action::Stop(Mode::Dictation));
    }

    #[test]
    fn second_key_ignored_while_recording() {
        let mut m = machine(true);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 0)), Action::Start(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::RAlt, true, 300)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RAlt, false, 600)), Action::None);
        assert_eq!(m.active(), Some(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 1000)), Action::Stop(Mode::Dictation));
        // Y al revés: Lazo graba, dictado no interrumpe.
        assert_eq!(m.on_event(ev(PhysKey::RAlt, true, 2000)), Action::Start(Mode::Lazo));
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 2100)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 2200)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RAlt, false, 3000)), Action::Stop(Mode::Lazo));
    }

    #[test]
    fn escape_cancels() {
        let mut m = machine(true);
        assert_eq!(m.on_event(ev(PhysKey::Other(VK_ESCAPE), true, 0)), Action::None);
        m.on_event(ev(PhysKey::RCtrl, true, 0));
        assert_eq!(m.on_event(ev(PhysKey::Other(VK_ESCAPE), true, 500)), Action::Cancel);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 900)), Action::None);
        assert_eq!(m.active(), None);
        // En manos libres también.
        m.on_event(ev(PhysKey::RCtrl, true, 2000));
        m.on_event(ev(PhysKey::RCtrl, false, 2050));
        m.on_event(ev(PhysKey::RCtrl, true, 2150));
        m.on_event(ev(PhysKey::RCtrl, false, 2200));
        assert_eq!(m.on_event(ev(PhysKey::Other(VK_ESCAPE), true, 4000)), Action::Cancel);
        assert_eq!(m.active(), None);
    }

    #[test]
    fn shortcut_while_holding_cancels() {
        // RCtrl+C es un atajo, no dictado.
        let mut m = machine(true);
        m.on_event(ev(PhysKey::RCtrl, true, 0));
        assert_eq!(m.on_event(ev(PhysKey::LShift, true, 50)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::Other(0x43), true, 100)), Action::Cancel);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 200)), Action::None);
    }

    #[test]
    fn injected_events_ignored() {
        let mut m = machine(true);
        let mut e = ev(PhysKey::RCtrl, true, 0);
        e.injected = true;
        assert_eq!(m.on_event(e), Action::None);
        assert_eq!(m.active(), None);
        // Nuestro propio Ctrl+V inyectado durante una grabación no cancela.
        m.on_event(ev(PhysKey::RAlt, true, 100));
        let mut v = ev(PhysKey::Other(0x56), true, 200);
        v.injected = true;
        assert_eq!(m.on_event(v), Action::None);
        let mut up = ev(PhysKey::RAlt, false, 300);
        up.injected = true;
        assert_eq!(m.on_event(up), Action::None);
        assert_eq!(m.active(), Some(Mode::Lazo));
    }

    #[test]
    fn altgr_chord_triggers_only_lazo() {
        let mut m = machine(true);
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, true, 0)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RAlt, true, 2)), Action::Start(Mode::Lazo));
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, false, 900)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RAlt, false, 900)), Action::Stop(Mode::Lazo));
    }

    #[test]
    fn altgr_phantom_ctrl_does_not_complete_ctrl_win() {
        // Dictado en Ctrl+Win: el LCtrl falso de AltGr no cuenta como Ctrl.
        let mut m = HotkeyMachine::new(Binding::CtrlWin, Binding::RightAlt, true);
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, true, 0)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RAlt, true, 3)), Action::Start(Mode::Lazo));
        assert_eq!(m.on_event(ev(PhysKey::LWin, true, 100)), Action::None);
        assert_eq!(m.active(), Some(Mode::Lazo));
        assert_eq!(m.on_event(ev(PhysKey::LWin, false, 150)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RAlt, false, 900)), Action::Stop(Mode::Lazo));
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, false, 900)), Action::None);
    }

    #[test]
    fn real_left_ctrl_then_alt_later_is_not_altgr() {
        let mut m = HotkeyMachine::new(Binding::CtrlWin, Binding::RightAlt, true);
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, true, 0)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::LWin, true, 40)), Action::Start(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::LWin, false, 1500)), Action::Stop(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, false, 1520)), Action::None);
    }

    #[test]
    fn ctrl_win_combo_in_either_order() {
        let mut m = HotkeyMachine::new(Binding::CtrlWin, Binding::RightAlt, false);
        assert_eq!(m.on_event(ev(PhysKey::LWin, true, 0)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, true, 30)), Action::Start(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, true, 600)), Action::None); // repetición
        assert_eq!(m.on_event(ev(PhysKey::LCtrl, false, 1000)), Action::Stop(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::LWin, false, 1010)), Action::None);
    }

    #[test]
    fn reset_returns_to_idle() {
        let mut m = machine(true);
        m.on_event(ev(PhysKey::RCtrl, true, 0));
        m.reset();
        assert_eq!(m.active(), None);
        // La tecla sigue abajo: soltarla no hace nada.
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 500)), Action::None);
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 900)), Action::Start(Mode::Dictation));
    }

    #[test]
    fn mic_opens_only_after_hold_or_hands_free() {
        let mut m = machine(true);
        assert!(!m.should_open_mic(0));
        m.on_event(ev(PhysKey::RCtrl, true, 1000));
        assert!(!m.should_open_mic(1100));
        assert!(m.should_open_mic(1000 + MIC_HOLD_MS));
        // Toque corto: en la espera del segundo toque no se abre.
        let mut m = machine(true);
        m.on_event(ev(PhysKey::RCtrl, true, 0));
        m.on_event(ev(PhysKey::RCtrl, false, 80));
        assert!(!m.should_open_mic(200));
        m.on_event(ev(PhysKey::RCtrl, true, 200));
        assert!(m.is_hands_free());
        assert!(m.should_open_mic(210));
    }

    #[test]
    fn reconfigure_keeps_recording_when_bindings_unchanged() {
        let mut m = machine(true);
        m.on_event(ev(PhysKey::RCtrl, true, 0));
        assert!(!m.reconfigure(Binding::RightCtrl, Binding::RightAlt, true));
        assert_eq!(m.active(), Some(Mode::Dictation));
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, false, 1000)), Action::Stop(Mode::Dictation));
        // Cambian las teclas durante una grabación: se suelta y avisa.
        m.on_event(ev(PhysKey::RCtrl, true, 2000));
        assert!(m.reconfigure(Binding::RightShift, Binding::RightAlt, true));
        assert_eq!(m.active(), None);
        assert!(!m.reconfigure(Binding::RightCtrl, Binding::RightAlt, true));
    }

    #[test]
    fn tick_count_wrap_still_works() {
        let base = u32::MAX as u64 - 100;
        let mut m = machine(true);
        m.on_event(ev(PhysKey::RCtrl, true, base));
        m.on_event(ev(PhysKey::RCtrl, false, base + 50));
        // El contador de 32 bits dio la vuelta: 100 ms después de la primera pulsación.
        assert_eq!(m.on_event(ev(PhysKey::RCtrl, true, 0)), Action::None);
        assert!(m.is_hands_free());
        let mut m = machine(true);
        m.on_event(ev(PhysKey::RCtrl, true, base));
        m.on_event(ev(PhysKey::RCtrl, false, base + 50));
        assert_eq!(m.tick(10), Action::None);
        assert_eq!(m.tick(300), Action::Cancel);
    }

    #[test]
    fn binding_parse() {
        assert_eq!(Binding::parse("RightCtrl"), Some(Binding::RightCtrl));
        assert_eq!(Binding::parse("RightAlt"), Some(Binding::RightAlt));
        assert_eq!(Binding::parse("RightShift"), Some(Binding::RightShift));
        assert_eq!(Binding::parse("CtrlWin"), Some(Binding::CtrlWin));
        assert_eq!(Binding::parse("Foo"), None);
        assert_eq!(Binding::RightAlt.as_str(), "RightAlt");
    }
}
