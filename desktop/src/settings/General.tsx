import { useEffect, useState } from "react";
import { availableMonitors } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { Config, Theme } from "../config/types";
import { Field, Toggle, inputCls } from "./ui";

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
