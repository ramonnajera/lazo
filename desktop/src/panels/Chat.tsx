import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { sendMessage } from "../api/client";
import type { ApiError } from "../api/types";
import { addMessage, beginTyped, useChat } from "./chatStore";
import { IconMic, IconSend } from "../ui/icons";
import { refreshKeys } from "./usePanelData";

/** Claves de todos los paneles: lo que diga Lazo puede haber cambiado cualquiera. */
export const ALL_PANELS = ["tomas", "citas", "mediciones", "convocatorias"];

export function chatErrorText(e: unknown): string {
  const err = e as Partial<ApiError> | undefined;
  if (err?.kind === "offline") return "Sin conexión con Lazo. Revisa la red e intenta de nuevo.";
  if (err?.kind === "no_token") return "Falta el token de Lazo: agrégalo en Configuración → Conexión.";
  if (err?.kind === "unauthorized") return "El token de Lazo no es válido: revísalo en Configuración → Conexión.";
  return `Lazo no pudo responder: ${err?.message ?? "error desconocido"}`;
}

/** `active`: la sección está visible. Oculta con display:none no se puede desplazar; al mostrarse se baja al último mensaje. */
export function ChatPanel({ active = true }: { active?: boolean } = {}) {
  const { messages, micActive, thinking } = useChat();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, thinking]);
  useLayoutEffect(() => {
    if (active) endRef.current?.scrollIntoView?.({ block: "end" });
  }, [active]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setText("");
    addMessage("user", t);
    setSending(true);
    const finish = beginTyped();
    try {
      const r = await sendMessage(t);
      addMessage("lazo", r?.reply?.trim() || "Lazo no respondió nada");
      refreshKeys(...ALL_PANELS);
    } catch (e) {
      addMessage("error", chatErrorText(e));
    } finally {
      setSending(false);
      finish();
    }
  };

  const toggleMic = () => {
    invoke("lazo_mic", { on: !micActive }).catch(() => addMessage("error", "No pude abrir el micrófono"));
  };

  return (
    <div className="chat">
      <div className="chat-msgs">
        {messages.length === 0 && <p className="chat-empty">Pregúntale algo a Lazo o pídele que agende algo.</p>}
        {messages.map((m) => (
          <p key={m.id} className={`bub ${m.role === "user" ? "bub-me" : m.role === "error" ? "bub-err" : "bub-al"}`}>
            {m.text}
          </p>
        ))}
        {thinking && (
          <div className="think" role="status" aria-label="Lazo está pensando…" data-testid="thinking">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input placeholder="Escríbele a Lazo…" aria-label="Mensaje para Lazo" value={text} onChange={(e) => setText(e.target.value)} />
        <button
          type="button"
          aria-label={micActive ? "Terminar y enviar" : "Hablar con Lazo"}
          title={micActive ? "Terminar y enviar" : "Hablar con Lazo"}
          onClick={toggleMic}
          className={`chat-btn${micActive ? " rec" : ""}`}
        >
          <IconMic />
        </button>
        <button type="submit" aria-label="Enviar" title="Enviar" disabled={sending} className="chat-btn go">
          <IconSend />
        </button>
      </form>
    </div>
  );
}
