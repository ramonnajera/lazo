import { useEffect, useState } from "react";
import { availableMonitors } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { Config, Theme } from "../config/types";
import { setVozActiva, vozActiva, hablar } from "../voice/habla";
import { Field, Toggle, btnCls, inputCls } from "./ui";

interface Props {
  config: Config;
  saveConfig: (c: Config) => Promise<void>;
}

interface MonitorOpt {
  value: string;
  label: string;
}

export default function General({ config, saveConfig }: Props) {
  const g = config.general;
  const [monitors, setMonitors] = useState<MonitorOpt[]>([]);
  const [autostart, setAutostart] = useState(g.autostart);
  const [error, setError] = useState<string | null>(null);
  const [voz, setVoz] = useState(vozActiva);

  useEffect(() => {
    availableMonitors()
      .then((ms) =>
        setMonitors(
          ms.map((m) => ({
            value: `${m.position.x},${m.position.y}`,
            label: `${m.name ?? "Monitor"} — ${m.size.width}×${m.size.height}`,
          })),
        ),
      )
      .catch(() => setMonitors([]));
    invoke<boolean>("autostart_get").then(setAutostart).catch(() => {});
  }, []);

  const update = (patch: Partial<Config["general"]>) => saveConfig({ ...config, general: { ...g, ...patch } });

  const toggleAutostart = async (on: boolean) => {
    setError(null);
    try {
      await invoke("autostart_set", { enabled: on });
      setAutostart(on);
      await update({ autostart: on });
    } catch (e) {
      setError(`No se pudo cambiar el inicio con Windows: ${String(e)}`);
    }
  };

  return (
    <div className="max-w-md space-y-5">
      <h1 className="text-lg font-semibold">General</h1>
      <Toggle label="Iniciar con Windows" checked={autostart} onChange={toggleAutostart} />
      <Toggle label="Sonidos" checked={g.sounds} onChange={(v) => update({ sounds: v })} />
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <Toggle
            label="Leer en voz alta los avisos y las respuestas de Lazo"
            checked={voz}
            onChange={(v) => {
              setVozActiva(v);
              setVoz(v);
            }}
          />
          <button className={btnCls} onClick={() => hablar("Hola, soy Lazo. Así sueno cuando te aviso de tus medicinas y citas.", { forzar: true })}>
            Probar voz
          </button>
        </div>
        <p className="text-xs text-neutral-500">Usa las voces de Windows, sin enviar nada a internet. «Escuchar mi día» y «Necesito ayuda» siempre hablan.</p>
      </div>
      <Toggle
        label="Si estoy en pantalla completa (un video, una presentación), esperar a que salga para avisarme"
        checked={config.alerts.dndFullscreen}
        onChange={(v) => saveConfig({ ...config, alerts: { ...config.alerts, dndFullscreen: v } })}
      />
      <Field label="Monitor de la isla">
        <select className={inputCls} value={g.monitor ?? ""} onChange={(e) => update({ monitor: e.target.value || null })}>
          <option value="">Principal</option>
          {monitors.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tema">
        <select className={inputCls} value={g.theme} onChange={(e) => update({ theme: e.target.value as Theme })}>
          <option value="system">Sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
