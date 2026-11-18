import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ListenState } from "./listen";

const BARS = 9;
const SHAPE = [0.45, 0.65, 0.85, 1, 1, 1, 0.85, 0.65, 0.45];
/** Tope de la animación: 30 cuadros por segundo. */
const FRAME_MS = 1000 / 30;

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Ondas y tiempo de la grabación. Solo existe mientras se graba: el bucle de rAF (≤ 30 fps) se cancela
 * al desmontarse, así que en cualquier otra fase no queda ningún cuadro pendiente.
 */
function Recording({ level }: { level: number }) {
  const levelRef = useRef(level);
  levelRef.current = level;
  const [frame, setFrame] = useState(() => ({ t: performance.now(), start: performance.now() }));
  useEffect(() => {
    const start = performance.now();
    let last = start;
    let raf = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - last < FRAME_MS) return;
      last = now;
      setFrame({ t: now, start });
    };
    setFrame({ t: start, start });
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  const l = Math.min(1, Math.sqrt(Math.max(0, levelRef.current)) * 1.4);
  const sec = frame.t / 1000;
  return (
    <>
      <span className="lis-wave" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => {
          const wobble = 0.5 + 0.5 * Math.sin(sec * 9 + i * 1.3);
          const h = 3 + 15 * SHAPE[i] * Math.max(0.08, l * (0.55 + 0.45 * wobble));
          return <i key={i} data-testid="wave-bar" style={{ height: `${h.toFixed(1)}px` }} />;
        })}
      </span>
      <span className="lis-time">{clock(frame.t - frame.start)}</span>
    </>
  );
}

const pill = "lis-b";

interface Props {
  state: ListenState | null;
  /** Respuesta a "¿Suspender/Apagar el equipo?". */
  onConfirm?: (accept: boolean) => void;
}

/** Dictado que no se pudo pegar ni escribir: se ve lo dictado y se puede copiar. */
function Unpasted({ text }: { text: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <>
      <span className="lis-err">No se pegó:</span>
      <span className="lis-text" title={text}>
        {text}
      </span>
      <button
        className={pill}
        onClick={(e) => {
          e.stopPropagation();
          invoke("copy_text", { text })
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied === null ? "Copiar" : copied ? "Copiado" : "Reintentar"}
      </button>
    </>
  );
}

export default function Listening({ state, onConfirm }: Props) {
  const label = state?.mode === "lazo" ? "Lazo" : "Dictado";
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const btn = (text: string, onClick: () => void) => (
    <button
      className={pill}
      onClick={(e) => {
        stop(e);
        onClick();
      }}
    >
      {text}
    </button>
  );
  const settingsBtn = (section: string, text: string) => btn(text, () => void invoke("open_settings", { section }).catch(() => {}));

  if (!state || state.phase === "recording") {
    return (
      <div className="lis" role="status" aria-live="polite">
        <span className="lis-dot" aria-hidden />
        <span className="lis-tag">{label}</span>
        <Recording key={state?.id ?? 0} level={state?.level ?? 0} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (state.phase === "processing") {
    body = <span className="lis-text" style={{ color: "var(--text-2)" }}>Transcribiendo…</span>;
  } else if (state.phase === "thinking") {
    body = <span className="lis-text" style={{ color: "var(--text-2)" }}>Lazo está pensando…</span>;
  } else if (state.phase === "confirm") {
    body = (
      <>
        <span className="lis-text">{state.text}</span>
        {btn("Sí", () => onConfirm?.(true))}
        {btn("Cancelar", () => onConfirm?.(false))}
      </>
    );
  } else if (state.phase === "done") {
    body = (
      <>
        <span className="lis-text" title={state.reply ? "Clic para abrir el chat" : undefined}>
          {state.text ?? ""}
        </span>
        {state.action === "commands" && settingsBtn("commands", "Agregar")}
      </>
    );
  } else if (state.action === "copy") {
    body = <Unpasted key={state.id} text={state.text ?? ""} />;
  } else {
    body = (
      <>
        <span className="lis-text lis-err">{state.text}</span>
        {state.action === "mic" && btn("Abrir permisos", () => void invoke("open_mic_privacy").catch(() => {}))}
        {state.action === "model" && settingsBtn("voice", "Descargar")}
        {state.action === "connection" && settingsBtn("connection", "Conexión")}
      </>
    );
  }

  return (
    <div className="lis" role="status" aria-live="polite">
      <span className="lis-tag">{label}</span>
      <div className="lis-body">{body}</div>
    </div>
  );
}
