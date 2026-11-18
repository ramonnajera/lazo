import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Config, Keys as KeysCfg } from "../config/types";
import { KEY_LABELS, bindingFromKey, bindingLabel, comboFromKey, conflicts } from "./keyCapture";
import { btnCls } from "./ui";

interface Props {
  config: Config;
  saveConfig: (c: Config) => Promise<void>;
}

interface HotkeyStatus {
  hook: string | null;
  openIsland: string | null;
  chat: string | null;
}

const FIELDS: { field: keyof KeysCfg; kind: "binding" | "combo"; hint: string }[] = [
  { field: "dictation", kind: "binding", hint: "Mantén para dictar; doble toque para manos libres." },
  { field: "lazo", kind: "binding", hint: "Mantén para hablarle a Lazo." },
  { field: "openIsland", kind: "combo", hint: "Abre o cierra la isla." },
  { field: "chat", kind: "combo", hint: "Abre el chat con Lazo." },
];

export default function Keys({ config, saveConfig }: Props) {
  const keys = config.keys;
  const [capturing, setCapturing] = useState<keyof KeysCfg | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<HotkeyStatus | null>(null);

  const refreshStatus = () => invoke<HotkeyStatus>("hotkey_status").then(setStatus).catch(() => {});
  useEffect(() => {
    refreshStatus();
  }, [config]);

  // Mientras se captura, las teclas globales no disparan (si no, Ctrl derecho empezaría a dictar).
  useEffect(() => {
    invoke("set_hotkeys_suspended", { suspended: capturing !== null }).catch(() => {});
    if (!capturing) return;
    const kind = FIELDS.find((f) => f.field === capturing)!.kind;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setCapturing(null);
        return;
      }
      const value = kind === "binding" ? bindingFromKey(e) : comboFromKey(e);
      if (!value) return; // sigue esperando (p. ej. solo se presionó un modificador)
      const clash = conflicts(keys, capturing, value);
      setCapturing(null);
      if (clash) {
        setMessage(`Esa tecla ya se usa para «${KEY_LABELS[clash]}». Elige otra.`);
        return;
      }
      setMessage(null);
      saveConfig({ ...config, keys: { ...keys, [capturing]: value } }).catch((err) => setMessage(String(err)));
    };
    // Cerrar u ocultar Configuración (se oculta, no se desmonta) cancela la captura: las teclas vuelven a funcionar.
    const cancel = () => setCapturing(null);
    const onVisibility = () => document.hidden && cancel();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [capturing, config, keys, saveConfig]);

  useEffect(() => () => void invoke("set_hotkeys_suspended", { suspended: false }).catch(() => {}), []);

  return (
    <div className="max-w-md space-y-5">
      <h1 className="text-lg font-semibold">Teclas</h1>
      {status?.hook && <p className="text-sm text-red-600">{status.hook}</p>}
      {FIELDS.map(({ field, kind, hint }) => {
        const err = field === "openIsland" ? status?.openIsland : field === "chat" ? status?.chat : null;
        return (
          <div key={field} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{KEY_LABELS[field]}</span>
              <button className={btnCls} onClick={() => setCapturing(capturing === field ? null : field)}>
                {capturing === field ? "Presiona la nueva tecla…" : kind === "binding" ? bindingLabel(keys[field]) : keys[field] || "Sin atajo"}
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              {capturing === field
                ? kind === "binding"
                  ? "Ctrl derecho, Alt derecho, Mayús derecha o Ctrl + Win. Esc cancela."
                  : "Una combinación con Ctrl, Alt, Mayús o Win. Esc cancela."
                : hint}
            </p>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        );
      })}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
