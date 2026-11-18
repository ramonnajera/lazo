import { describe, expect, it } from "vitest";
import { growRegion, reduce, regionFor, stripFor, type IslandModel, type IslandEvent } from "./model";

const init: IslandModel = { view: "hidden", section: "hoy", prev: "hidden" };
const on = { hovering: true, paused: false };
const off = { hovering: false, paused: false };
const m = (view: IslandModel["view"], extra: Partial<IslandModel> = {}): IslandModel => ({ ...init, view, ...extra });
const run = (s: IslandModel, evs: IslandEvent[], o = on) => evs.reduce((acc, e) => reduce(acc, e, o), s);

describe("island model", () => {
  it("hover_shows_bar", () => {
    expect(reduce(init, { type: "hover" }, on).view).toBe("bar");
    expect(reduce(m("open"), { type: "hover" }, on).view).toBe("open");
  });

  it("section_opens_and_switches", () => {
    const a = reduce(m("bar"), { type: "section", section: "citas" }, on);
    expect(a).toMatchObject({ view: "open", section: "citas" });
    const b = reduce(a, { type: "section", section: "salud" }, on);
    expect(b).toMatchObject({ view: "open", section: "salud" });
    expect(reduce(m("music"), { type: "section", section: "apoyos" }, on)).toMatchObject({ view: "open", section: "apoyos" });
  });

  it("same_section_closes_to_bar", () => {
    const o = m("open", { section: "citas" });
    expect(reduce(o, { type: "section", section: "citas" }, on).view).toBe("bar");
  });

  it("form_ignores_leave", () => {
    expect(reduce(m("form"), { type: "leave" }, off).view).toBe("form");
  });

  it("escape_chain_form_open_hidden", () => {
    expect(run(m("form"), [{ type: "escape" }]).view).toBe("open");
    expect(run(m("form"), [{ type: "escape" }, { type: "escape" }]).view).toBe("hidden");
    expect(run(m("form"), [{ type: "closeForm" }]).view).toBe("open");
    expect(reduce(m("bar"), { type: "escape" }, on).view).toBe("hidden");
    expect(reduce(m("music"), { type: "escape" }, on).view).toBe("hidden");
  });

  it("open_form_and_music", () => {
    expect(reduce(m("open"), { type: "openForm" }, on).view).toBe("form");
    expect(reduce(m("bar"), { type: "music" }, on).view).toBe("music");
    expect(reduce(m("bar"), { type: "openChat" }, on)).toMatchObject({ view: "open", section: "chat" });
    expect(reduce(init, { type: "open" }, on).view).toBe("bar");
    expect(reduce(init, { type: "toggle" }, on).view).toBe("bar");
    expect(reduce(m("open"), { type: "toggle" }, on).view).toBe("hidden");
    expect(reduce(m("form"), { type: "toggle" }, on).view).toBe("form");
  });

  it("listening_returns_to_prev", () => {
    const l = reduce(m("open"), { type: "listenStart" }, on);
    expect(l).toMatchObject({ view: "listening", prev: "open" });
    expect(reduce(l, { type: "listenEnd" }, on).view).toBe("open");
    const f = reduce(m("form"), { type: "listenStart" }, on);
    expect(reduce(f, { type: "listenEnd" }, off).view).toBe("form");
  });

  it("listen_end_hides_when_not_hovering", () => {
    const l = reduce(m("bar"), { type: "listenStart" }, on);
    expect(reduce(l, { type: "listenEnd" }, off).view).toBe("hidden");
    const h = reduce(init, { type: "listenStart" }, off);
    expect(reduce(h, { type: "listenEnd" }, off).view).toBe("hidden");
  });

  it("alert_only_from_hidden_bar_or_music", () => {
    expect(reduce(init, { type: "alert" }, off)).toMatchObject({ view: "alert", prev: "hidden" });
    expect(reduce(m("bar"), { type: "alert" }, on)).toMatchObject({ view: "alert", prev: "bar" });
    for (const v of ["open", "form", "listening"] as const) {
      expect(reduce(m(v), { type: "alert" }, on).view).toBe(v);
    }
  });

  it("alert_returns_to_hidden_when_not_hovering", () => {
    const a = reduce(m("bar"), { type: "alert" }, on);
    expect(reduce(a, { type: "dismiss" }, off).view).toBe("hidden");
    expect(reduce(a, { type: "dismiss" }, on).view).toBe("bar");
    const b = reduce(init, { type: "alert" }, off);
    expect(reduce(b, { type: "dismiss" }, off).view).toBe("hidden");
  });

  it("paused_blocks_hover_and_sections", () => {
    const p = { hovering: true, paused: true };
    expect(reduce(init, { type: "hover" }, p).view).toBe("hidden");
    expect(reduce(m("bar"), { type: "section", section: "citas" }, p).view).toBe("bar");
    expect(reduce(m("bar"), { type: "music" }, p).view).toBe("bar");
    expect(reduce(init, { type: "toggle" }, p).view).toBe("hidden");
    expect(reduce(init, { type: "alert" }, p).view).toBe("hidden");
    expect(reduce(m("open"), { type: "leave" }, p).view).toBe("hidden");
    expect(reduce(m("open"), { type: "escape" }, p).view).toBe("hidden");
    expect(reduce(m("bar"), { type: "listenStart" }, p).view).toBe("listening");
  });

  it("leave_then_hover_reopens_once", () => {
    const a = reduce(init, { type: "hover" }, on);
    expect(a.view).toBe("bar");
    const b = reduce(a, { type: "leave" }, off);
    expect(b.view).toBe("hidden");
    const c = reduce(b, { type: "hover" }, on);
    expect(c.view).toBe("bar");
    expect(reduce(c, { type: "hover" }, on)).toEqual(c);
  });

  it("restore_to_bar_when_prev_hidden_and_hovering", () => {
    const l = reduce(init, { type: "listenStart" }, off);
    expect(reduce(l, { type: "listenEnd" }, on).view).toBe("bar");
    const a = reduce(init, { type: "alert" }, off);
    expect(reduce(a, { type: "dismiss" }, on).view).toBe("bar");
  });

  it("open_chat_does_not_replace_form", () => {
    const f = m("form", { section: "citas" });
    expect(reduce(f, { type: "openChat" }, on)).toEqual(f);
  });

  it("escape_in_alert_restores", () => {
    const a = reduce(m("bar"), { type: "alert" }, on);
    expect(reduce(a, { type: "escape" }, on).view).toBe("bar");
    expect(reduce(a, { type: "escape" }, off).view).toBe("hidden");
  });

  it("listen_start_from_alert_keeps_prev", () => {
    const a = reduce(m("bar"), { type: "alert" }, on);
    const l = reduce(a, { type: "listenStart" }, on);
    expect(l).toMatchObject({ view: "listening", prev: "bar" });
  });

  it("open_chat_ignored_while_listening", () => {
    const l = reduce(m("bar"), { type: "listenStart" }, on);
    expect(reduce(l, { type: "openChat" }, on)).toEqual(l);
  });

  it("dismiss_and_listen_end_allowed_while_paused", () => {
    const p = { hovering: false, paused: true };
    const a = reduce(init, { type: "alert" }, off);
    expect(reduce(a, { type: "dismiss" }, p).view).toBe("hidden");
    const l = reduce(m("bar"), { type: "listenStart" }, on);
    expect(reduce(l, { type: "listenEnd" }, p).view).toBe("hidden");
  });

  it("listen_end_prev_open_or_music_not_hovering_hides", () => {
    for (const v of ["open", "music"] as const) {
      const l = reduce(m(v), { type: "listenStart" }, on);
      expect(reduce(l, { type: "listenEnd" }, off).view).toBe("hidden");
    }
  });

  it("form_close_or_escape_hides_when_not_hovering", () => {
    expect(reduce(m("form"), { type: "closeForm" }, on).view).toBe("open");
    expect(reduce(m("form"), { type: "escape" }, on).view).toBe("open");
    expect(reduce(m("form"), { type: "closeForm" }, off).view).toBe("hidden");
    expect(reduce(m("form"), { type: "escape" }, off).view).toBe("hidden");
  });

  it("strip_tracks_bar_width", () => {
    expect(regionFor("hidden", null, 274)).toEqual({ x: 63, y: 0, w: 274, h: 4 });
    expect(regionFor("hidden", { w: 372, h: 324 }, 300)).toEqual({ x: 50, y: 0, w: 300, h: 4 });
    expect(regionFor("hidden", null, null)).toEqual({ x: 14, y: 0, w: 372, h: 4 });
    expect(regionFor("hidden", null, 500)).toEqual({ x: 14, y: 0, w: 372, h: 4 });
    expect(regionFor("bar", { w: 274, h: 36 }, 300)).toEqual({ x: 63, y: 0, w: 274, h: 36 });
  });

  it("grow_region_only_when_the_view_changes_and_grows", () => {
    const strip = stripFor(280);
    const ctx = (sent = strip) => ({ known: {}, barW: 280, sent });
    // Pausada: el reductor ignora el hover → no se toca la región (no queda una zona invisible).
    expect(growRegion(init, { type: "hover" }, { hovering: true, paused: true }, ctx())).toBeNull();
    expect(growRegion(m("bar"), { type: "section", section: "citas" }, { hovering: true, paused: true }, ctx())).toBeNull();
    // Hover real: la barra prevista, antes de confirmar.
    expect(growRegion(init, { type: "hover" }, on, ctx())).toEqual({ x: 60, y: 0, w: 280, h: 36 });
    // Barra → abierta / música, y teclado/bandeja/aviso/escucha.
    const bar = regionFor("bar", { w: 280, h: 36 });
    expect(growRegion(m("bar"), { type: "section", section: "citas" }, on, ctx(bar))).toEqual({ x: 14, y: 0, w: 372, h: 360 });
    expect(growRegion(m("bar"), { type: "music" }, on, ctx(bar))).toEqual({ x: 14, y: 0, w: 372, h: 360 });
    expect(growRegion(init, { type: "toggle" }, off, ctx())).toEqual({ x: 60, y: 0, w: 280, h: 36 });
    expect(growRegion(init, { type: "openChat" }, off, ctx())).toEqual({ x: 14, y: 0, w: 372, h: 360 });
    expect(growRegion(init, { type: "alert" }, off, ctx())).toEqual({ x: 14, y: 0, w: 372, h: 73 });
    expect(growRegion(init, { type: "listenStart" }, off, ctx())).toEqual({ x: 50, y: 0, w: 300, h: 40 });
    // Lo ya medido manda sobre lo supuesto.
    expect(growRegion(m("bar"), { type: "section", section: "citas" }, on, { known: { "open:citas": { w: 372, h: 200 } }, barW: 280, sent: bar })).toEqual({
      x: 14,
      y: 0,
      w: 372,
      h: 200,
    });
    // Sin cambio de vista, o si encoge: nada (se ajusta tras confirmar).
    expect(growRegion(m("open"), { type: "section", section: "citas" }, on, ctx(regionFor("open", { w: 372, h: 324 })))).toBeNull();
    expect(growRegion(m("open"), { type: "escape" }, on, ctx(regionFor("open", { w: 372, h: 324 })))).toBeNull();
    expect(growRegion(m("form"), { type: "listenStart" }, on, ctx(regionFor("form", { w: 372, h: 360 })))).toBeNull();
  });

  it("regionFor_hidden_is_strip", () => {
    expect(regionFor("hidden", null)).toEqual({ x: 14, y: 0, w: 372, h: 4 });
    expect(regionFor("bar", null)).toEqual({ x: 14, y: 0, w: 372, h: 4 });
    expect(regionFor("hidden", { w: 300, h: 40 })).toEqual({ x: 14, y: 0, w: 372, h: 4 });
  });

  it("regionFor_centers_measured_rect", () => {
    expect(regionFor("listening", { w: 300, h: 40 })).toEqual({ x: 50, y: 0, w: 300, h: 40 });
    expect(regionFor("open", { w: 372, h: 200 })).toEqual({ x: 14, y: 0, w: 372, h: 200 });
  });

  it("standalone_listening_predicts_the_recording_pill_not_the_last_reply_size", () => {
    const ctx = { known: { listening: { w: 300, h: 160 } }, barW: 280, sent: stripFor(280) };
    expect(growRegion(m("bar"), { type: "listenStart" }, on, ctx)).toEqual({ x: 50, y: 0, w: 300, h: 40 });
    // Sobre una sección abierta se conserva el tamaño conocido de la tarjeta (no se toca aquí).
    expect(growRegion(m("hidden"), { type: "alert" }, on, { ...ctx, known: {} })?.h).toBe(73);
  });

  it("close_form_under_dictation_pill_closes_the_form", () => {
    const l = reduce(m("form", { section: "citas" }), { type: "listenStart" }, on);
    expect(l).toMatchObject({ view: "listening", prev: "form" });
    // Guardar / Cancelar: la píldora sigue, el formulario ya no está debajo.
    expect(reduce(l, { type: "closeForm" }, on)).toMatchObject({ view: "listening", prev: "open", section: "citas" });
    expect(reduce(l, { type: "closeForm" }, off)).toMatchObject({ view: "listening", prev: "hidden" });
    // Esc hace lo mismo que cerrar el formulario.
    expect(reduce(l, { type: "escape" }, on)).toMatchObject({ view: "listening", prev: "open" });
    expect(reduce(l, { type: "escape" }, off)).toMatchObject({ view: "listening", prev: "hidden" });
    // Al terminar ya no vuelve al formulario.
    expect(run(l, [{ type: "closeForm" }, { type: "listenEnd" }], on).view).toBe("open");
    expect(run(l, [{ type: "closeForm" }, { type: "listenEnd" }], off).view).toBe("hidden");
    // Sin formulario debajo, cerrar/Esc no tocan la escucha.
    const o = reduce(m("open"), { type: "listenStart" }, on);
    expect(reduce(o, { type: "closeForm" }, on)).toEqual(o);
    expect(reduce(o, { type: "escape" }, on)).toEqual(o);
  });

  it("leave_while_listening_over_floating_view_leaves_the_pill_alone", () => {
    for (const v of ["bar", "open", "music"] as const) {
      const l = reduce(m(v), { type: "listenStart" }, on);
      const g = reduce(l, { type: "leave" }, off);
      expect(g).toMatchObject({ view: "listening", prev: "hidden" });
      expect(reduce(g, { type: "listenEnd" }, off).view).toBe("hidden");
    }
    // Sobre un formulario no cambia nada.
    const f = reduce(m("form"), { type: "listenStart" }, on);
    expect(reduce(f, { type: "leave" }, off)).toEqual(f);
  });

  it("leave_ignored_while_typing", () => {
    const t = { hovering: false, paused: false, typing: true };
    for (const v of ["bar", "open", "music"] as const) {
      expect(reduce(m(v), { type: "leave" }, t).view).toBe(v);
      // Esc sigue cerrando.
      expect(reduce(m(v), { type: "escape" }, t).view).toBe("hidden");
    }
    const l = reduce(m("open"), { type: "listenStart" }, on);
    expect(reduce(l, { type: "leave" }, t)).toEqual(l);
    // Sin foco en un campo (clic afuera) vuelve a esconderse.
    expect(reduce(m("open"), { type: "leave" }, off).view).toBe("hidden");
  });

  it("open_chat_from_alert_keeps_the_alert_for_the_banner", () => {
    const a = reduce(m("bar"), { type: "alert" }, on);
    expect(reduce(a, { type: "openChat" }, on)).toMatchObject({ view: "open", section: "chat", prev: "hidden" });
  });

  it("alert_from_music_shows_the_card_and_returns", () => {
    const a = reduce(m("music"), { type: "alert" }, on);
    expect(a).toMatchObject({ view: "alert", prev: "music" });
    expect(reduce(a, { type: "dismiss" }, on).view).toBe("music");
    expect(reduce(a, { type: "dismiss" }, off).view).toBe("hidden");
  });

  it("open_rect_is_remembered_per_section", () => {
    const bar = regionFor("bar", { w: 280, h: 36 });
    const ctx = { known: { "open:citas": { w: 372, h: 200 }, "open:chat": { w: 372, h: 340 } }, barW: 280, sent: bar };
    expect(growRegion(m("bar"), { type: "section", section: "citas" }, on, ctx)?.h).toBe(200);
    expect(growRegion(m("bar"), { type: "section", section: "chat" }, on, ctx)?.h).toBe(340);
    // Sección sin medir: lo supuesto.
    expect(growRegion(m("bar"), { type: "section", section: "apoyos" }, on, ctx)?.h).toBe(360);
  });

  it("region_uses_measured_left_and_real_window_width", () => {
    expect(regionFor("open", { x: 13.5, w: 372, h: 200 })).toEqual({ x: 13.5, y: 0, w: 372, h: 200 });
    expect(regionFor("hidden", null, 300, 402)).toEqual({ x: 51, y: 0, w: 300, h: 4 });
    expect(stripFor(300, 402)).toEqual({ x: 51, y: 0, w: 300, h: 4 });
    expect(regionFor("bar", { w: 280, h: 36 }, 280, 402)).toEqual({ x: 61, y: 0, w: 280, h: 36 });
  });
});
