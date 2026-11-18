// Captura de "presiona la nueva tecla" en Configuración → Teclas.
import type { Keys } from "../config/types";

export type BindingName = "RightCtrl" | "RightAlt" | "RightShift" | "CtrlWin";

export const BINDINGS: { value: BindingName; label: string }[] = [
  { value: "RightCtrl", label: "Ctrl derecho" },
  { value: "RightAlt", label: "Alt derecho (AltGr)" },
  { value: "RightShift", label: "Mayús derecha" },
  { value: "CtrlWin", label: "Ctrl + Win" },
];

export const KEY_LABELS: Record<keyof Keys, string> = {
  dictation: "Dictado",
  lazo: "Lazo",
  openIsland: "Abrir isla",
  chat: "Chat",
};

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Tecla de grabación (dictado / Lazo): solo los valores de `Binding` en Rust. */
export function bindingFromKey(e: KeyLike): BindingName | null {
  if ((e.code === "MetaLeft" && e.ctrlKey) || (e.code === "ControlLeft" && e.metaKey)) return "CtrlWin";
  if (e.code === "ControlRight") return "RightCtrl";
  if (e.code === "AltRight") return "RightAlt";
  if (e.code === "ShiftRight") return "RightShift";
  return null;
}

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

/** Atajo (abrir isla / chat) en el formato de tauri-plugin-global-shortcut: "Ctrl+Alt+Space". */
export function comboFromKey(e: KeyLike): string | null {
  if (MODIFIER_CODES.test(e.code)) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  if (mods.length === 0) return null;
  const key = e.code.replace(/^Key/, "").replace(/^Digit/, "");
  return [...mods, key].join("+");
}

export function bindingLabel(v: string): string {
  return BINDINGS.find((b) => b.value === v)?.label ?? v;
}

/** Otra tecla que ya usa `value` (sin distinguir mayúsculas), o null. */
export function conflicts(keys: Keys, field: keyof Keys, value: string): keyof Keys | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const other = (Object.keys(keys) as (keyof Keys)[]).find((k) => k !== field && norm(keys[k]) === norm(value));
  return other ?? null;
}
