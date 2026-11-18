export type View = "hidden" | "bar" | "open" | "form" | "listening" | "alert" | "music";
export type Section = "hoy" | "citas" | "salud" | "apoyos" | "chat";

export interface IslandModel {
  view: View;
  section: Section;
  /** Vista a la que regresan `listening` y `alert`. */
  prev: View;
}

export type IslandEvent =
  | { type: "hover" }
  | { type: "leave" }
  | { type: "section"; section: Section }
  | { type: "openForm" }
  | { type: "closeForm" }
  | { type: "music" }
  | { type: "listenStart" }
  | { type: "listenEnd" }
  | { type: "alert" }
  | { type: "dismiss" }
  | { type: "escape" }
  | { type: "toggle" }
  | { type: "openChat" }
  | { type: "open" };

export interface IslandOpts {
  hovering: boolean;
  paused: boolean;
  /** Un campo de texto de la isla tiene el foco: sacar el ratón no la esconde (Esc o clic afuera, sí). */
  typing?: boolean;
}

export const WIN_W = 400;
export const ISLAND_W = 372;
export const STRIP_H = 4;
export const LISTEN_W = 300;

export const INITIAL_MODEL: IslandModel = { view: "hidden", section: "hoy", prev: "hidden" };

const PAUSED_OK = new Set<IslandEvent["type"]>(["leave", "escape", "listenStart", "listenEnd", "dismiss"]);

/**
 * Vuelve a `prev`; si era una vista flotante y el ratón ya no está encima, se esconde.
 * Si estaba escondida pero el ratón quedó encima, muestra la barra (no hay otro mouseenter).
 */
function restore(m: IslandModel, o: IslandOpts): IslandModel {
  const floating = m.prev === "bar" || m.prev === "open" || m.prev === "music";
  let view: View = m.prev;
  if (floating && !o.hovering) view = "hidden";
  else if (m.prev === "hidden" && o.hovering) view = "bar";
  return { ...m, view, prev: "hidden" };
}

/** Al cerrar un formulario se vuelve a la sección; si el ratón ya no está encima, se esconde. */
function leaveForm(m: IslandModel, o: IslandOpts): IslandModel {
  return { ...m, view: o.hovering ? "open" : "hidden" };
}

/** Cerrar el formulario que está debajo de la píldora de dictado: la escucha sigue, cambia a dónde vuelve. */
function leaveFormUnder(m: IslandModel, o: IslandOpts): IslandModel {
  return { ...m, prev: o.hovering ? "open" : "hidden" };
}

const FLOATING = new Set<View>(["bar", "open", "music"]);

export function reduce(m: IslandModel, e: IslandEvent, o: IslandOpts): IslandModel {
  if (o.paused && !PAUSED_OK.has(e.type)) return m;
  const v = m.view;
  switch (e.type) {
    case "hover":
      return v === "hidden" ? { ...m, view: "bar" } : m;
    case "leave":
      if (o.typing) return m;
      if (FLOATING.has(v)) return { ...m, view: "hidden" };
      // Dictando sobre la barra, una sección o la música: lo de abajo se esconde y queda la píldora sola.
      if (v === "listening" && FLOATING.has(m.prev)) return { ...m, prev: "hidden" };
      return m;
    case "section":
      if (v === "bar" || v === "music") return { ...m, view: "open", section: e.section };
      if (v === "open") {
        return e.section === m.section ? { ...m, view: "bar" } : { ...m, section: e.section };
      }
      return m;
    case "openForm":
      return v === "open" ? { ...m, view: "form" } : m;
    case "closeForm":
      if (v === "form") return leaveForm(m, o);
      return v === "listening" && m.prev === "form" ? leaveFormUnder(m, o) : m;
    case "music":
      return v === "bar" ? { ...m, view: "music" } : m;
    case "listenStart":
      if (v === "listening") return m;
      return { ...m, view: "listening", prev: v === "alert" ? m.prev : v };
    case "listenEnd":
      return v === "listening" ? restore(m, o) : m;
    case "alert":
      // Desde la música también sale la tarjeta: abajo no hay banner y el aviso no puede contarse sin verse.
      return v === "hidden" || v === "bar" || v === "music" ? { ...m, view: "alert", prev: v } : m;
    case "dismiss":
      return v === "alert" ? restore(m, o) : m;
    case "escape":
      if (v === "form") return leaveForm(m, o);
      if (v === "alert") return restore(m, o);
      if (v === "listening" && m.prev === "form") return leaveFormUnder(m, o);
      return v === "open" || v === "bar" || v === "music" ? { ...m, view: "hidden" } : m;
    case "toggle":
      if (v === "form" || v === "listening") return m;
      return v === "hidden" ? { ...m, view: "bar" } : { ...m, view: "hidden" };
    case "openChat":
      // Un formulario tiene datos sin guardar: no se reemplaza.
      if (v === "listening" || v === "form") return m;
      // Desde el aviso, este sigue vigente y se ve como banner dentro del chat.
      return { ...m, view: "open", section: "chat", prev: v === "alert" ? "hidden" : m.prev };
    case "open":
      return v === "hidden" ? { ...m, view: "bar" } : m;
  }
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Franja escondida: tan ancha como la última barra medida (centrada), para que no haya zonas muertas.
 * `winW`: ancho real de la ventana (window.innerWidth); por omisión el lógico fijo.
 */
export function stripFor(barW?: number | null, winW: number = WIN_W): Region {
  const w = barW && barW > 0 && barW <= ISLAND_W ? barW : ISLAND_W;
  return { x: (winW - w) / 2, y: 0, w, h: STRIP_H };
}

/** `rect.x`: borde izquierdo medido (getBoundingClientRect().left); si falta, se centra en `winW`. */
export function regionFor(view: View, rect: { x?: number; w: number; h: number } | null, barW?: number | null, winW: number = WIN_W): Region {
  if (view === "hidden") return stripFor(barW, winW);
  if (!rect) return stripFor(null, winW);
  return { x: rect.x ?? (winW - rect.w) / 2, y: 0, w: rect.w, h: rect.h };
}

/** Clave de `GrowCtx.known`: la vista abierta se recuerda por sección (cada una mide distinto). */
export function rectKey(view: View, section: Section): string {
  return view === "open" ? `open:${section}` : view;
}

type Size = { w: number; h: number };

/** Tamaño supuesto de cada vista mientras no se haya medido (alto máximo de la ventana para las tarjetas). */
const GUESS: Partial<Record<View, Size>> = {
  open: { w: ISLAND_W, h: 360 },
  form: { w: ISLAND_W, h: 360 },
  music: { w: ISLAND_W, h: 360 },
  alert: { w: ISLAND_W, h: 73 },
  listening: { w: LISTEN_W, h: 40 },
};

export interface GrowCtx {
  /** Último tamaño medido por vista. */
  known: Partial<Record<string, Size>>;
  /** Ancho de la barra sola. */
  barW: number | null;
  /** Región vigente (la última enviada). */
  sent: Region | null;
  /** Ancho real de la ventana (por omisión el lógico fijo). */
  winW?: number;
}

/**
 * Región que conviene aplicar ANTES de confirmar `e`, para que el primer cuadro de la vista nueva
 * no salga recortado. `null` si el reductor no cambia la vista (p. ej. pausada) o si la vista nueva
 * no es más grande que la región vigente: encoger se hace tras confirmar, con la medida real.
 */
export function growRegion(m: IslandModel, e: IslandEvent, o: IslandOpts, ctx: GrowCtx): Region | null {
  const nm = reduce(m, e, o);
  const next = nm.view;
  if (next === m.view || next === "hidden") return null;
  // Escuchando solo (sin tarjeta debajo) arranca como la píldora de grabación, no con el último tamaño (done/reply).
  const standaloneListen = next === "listening" && nm.prev !== "open" && nm.prev !== "form";
  const rect = (standaloneListen ? GUESS.listening : ctx.known[rectKey(next, nm.section)]) ?? (next === "bar" ? { w: ctx.barW ?? ISLAND_W, h: 36 } : GUESS[next]) ?? null;
  const r = regionFor(next, rect, ctx.barW, ctx.winW);
  const cur = ctx.sent;
  if (cur && r.w <= cur.w && r.h <= cur.h) return null;
  return r;
}
