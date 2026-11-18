// Carga del evento `listen-state` que emite src-tauri/src/voice.rs.
export type ListenMode = "dictation" | "lazo";
// "thinking": esperando a Lazo; "confirm": la isla pregunta antes de suspender o apagar
// (llega como evento `power-confirm` y se convierte aquí).
export type ListenPhase = "recording" | "processing" | "thinking" | "confirm" | "done" | "error";

export interface ListenState {
  id: number;
  mode: ListenMode;
  phase: ListenPhase;
  level?: number;
  text?: string;
  /** "copy": un dictado que no se pudo pegar; `text` es lo dictado. */
  action?: "mic" | "model" | "commands" | "connection" | "copy";
  /** Lo que se le dijo a Lazo. */
  heard?: string;
  /** `text` es la respuesta de Lazo. */
  reply?: boolean;
  /** Orden pendiente de confirmar (serde de lazo_core::commands::Command). */
  confirm?: unknown;
}

export interface PowerConfirm {
  id: number;
  cmd: unknown;
  text: string;
}

export function fromPowerConfirm(p: PowerConfirm): ListenState {
  return { id: p.id, mode: "lazo", phase: "confirm", text: p.text, confirm: p.cmd };
}

/** Sesión en curso: la isla no se esconde al salir el ratón. */
export function isActive(s: ListenState | null): boolean {
  return !!s && (s.phase === "recording" || s.phase === "processing" || s.phase === "thinking" || s.phase === "confirm");
}

export type Sound = "start" | "stop" | "error";

/** Cuánto se ve el texto final o un error antes de volver a la píldora. */
export const DONE_MS = 3000;
export const ERROR_MS = 6000;
export const REPLY_MS = 8000;
export const CONFIRM_MS = 30000;
/** Dictado sin pegar: tiempo para leerlo y copiarlo. */
export const COPY_MS = 20000;

/** Cuánto se ve un estado final antes de volver a la píldora; `null` = sin temporizador. */
export function holdMs(s: ListenState): number | null {
  if (s.phase === "recording" || s.phase === "processing" || s.phase === "thinking") return null;
  if (s.phase === "confirm") return CONFIRM_MS;
  if (s.phase === "error") return s.action === "copy" ? COPY_MS : ERROR_MS;
  if (s.reply) return REPLY_MS;
  if (s.action) return ERROR_MS;
  return s.text ? DONE_MS : 0;
}

/** Aplica un evento nuevo: ignora sesiones viejas y un `done` sin nada a la vista. */
export function nextListen(prev: ListenState | null, s: ListenState): ListenState | null {
  if (prev && s.id < prev.id) return prev;
  if (!prev && s.phase === "done") return null;
  if (prev && prev.id === s.id && prev.phase === s.phase && s.level === undefined) return { ...prev, ...s, level: prev.level };
  return s;
}

/** Sonido al cambiar de fase (nunca con cada nivel). */
export function soundFor(prev: ListenState | null, s: ListenState): Sound | null {
  if (prev && prev.id === s.id && prev.phase === s.phase) return null;
  if (s.phase === "recording") return "start";
  if (s.phase === "processing") return "stop";
  if (s.phase === "error") return "error";
  return null;
}
