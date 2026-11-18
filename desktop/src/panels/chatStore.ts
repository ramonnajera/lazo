import { useSyncExternalStore } from "react";
import type { ListenState } from "../island/listen";

// Historial del chat de esta sesión (solo en memoria) y estado del micrófono de Lazo.

export type ChatRole = "user" | "lazo" | "error";
export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
}

interface ChatSnapshot {
  messages: ChatMessage[];
  micActive: boolean;
  thinking: boolean;
}

let state: ChatSnapshot = { messages: [], micActive: false, thinking: false };
let nextId = 1;
const listeners = new Set<() => void>();

function set(patch: Partial<ChatSnapshot>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function addMessage(role: ChatRole, text: string): void {
  set({ messages: [...state.messages, { id: nextId++, role, text }] });
}

/** Lo que pasó con la tecla de Lazo o el micrófono del chat. */
export function addVoiceExchange(heard: string | undefined, reply: string, isError = false): void {
  const msgs = [...state.messages];
  if (heard) msgs.push({ id: nextId++, role: "user", text: heard });
  msgs.push({ id: nextId++, role: isError ? "error" : "lazo", text: reply });
  set({ messages: msgs });
}

// "Pensando" por petición: mensajes escritos en vuelo y sesiones de voz en fase thinking.
let typedPending = 0;
const voiceThinking = new Set<number>();

function syncThinking() {
  const thinking = typedPending > 0 || voiceThinking.size > 0;
  if (state.thinking !== thinking) set({ thinking });
}

/** Un mensaje escrito salió hacia Lazo; devuelve la función que lo da por terminado. */
export function beginTyped(): () => void {
  typedPending++;
  syncThinking();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    typedPending--;
    syncThinking();
  };
}

/** La isla le pasa cada `listen-state` de Lazo. Devuelve true si llegó una respuesta. */
export function ingestListen(s: ListenState): boolean {
  if (s.mode !== "lazo") return false;
  const micActive = s.phase === "recording";
  if (micActive !== state.micActive) set({ micActive });
  const wasThinking = voiceThinking.has(s.id);
  if (s.phase === "thinking") voiceThinking.add(s.id);
  else voiceThinking.delete(s.id);
  syncThinking();
  if (s.phase === "done" && s.reply && s.text) {
    addVoiceExchange(s.heard, s.text);
    return true;
  }
  // Errores de una pregunta a Lazo (con o sin lo que se oyó); no los del micrófono.
  if (s.phase === "error" && s.text && (s.heard || wasThinking)) addVoiceExchange(s.heard, s.text, true);
  return false;
}

export function resetChat(): void {
  nextId = 1;
  typedPending = 0;
  voiceThinking.clear();
  state = { messages: [], micActive: false, thinking: false };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useChat(): ChatSnapshot {
  return useSyncExternalStore(subscribe, () => state);
}
