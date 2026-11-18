import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Config } from "../config/types";
import { Field, btnCls, inputCls } from "./ui";

interface Props {
  config: Config;
  saveConfig: (c: Config) => Promise<void>;
}

export type ModelStatus = { state: "missing" } | { state: "downloading"; pct: number } | { state: "ready" };
export interface ModelProgress {
  status: ModelStatus;
  error: string | null;
  sizeMb: number;
}

export default function Voice({ config, saveConfig }: Props) {
  const v = config.voice;
  const [mics, setMics] = useState<string[]>([]);
  const [model, setModel] = useState<ModelProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [peak, setPeak] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<string[]>("list_microphones")
      .then((m) => alive && setMics(m))
      .catch(() => alive && setMics([]));
    // Primero el listener: así no se pierde un evento entre la consulta y la suscripción.
    const p = listen<ModelProgress>("model-progress", (e) => alive && setModel(e.payload));
    p.then(() => invoke<ModelProgress>("model_status"))
      .then((m) => alive && setModel((prev) => prev ?? m))
      .catch((e) => alive && setError(`No se pudo leer el estado del modelo: ${String(e)}`));
    return () => {
      alive = false;
      void p.then((u) => u());
    };
  }, []);

  const run = async (cmd: string) => {
    setError(null);
    try {
      await invoke(cmd);
    } catch (e) {
      setError(String(e));
    }
  };

  const micTest = async () => {
    setError(null);
    setPeak(null);
    setTesting(true);
    try {
      setPeak(await invoke<number>("mic_test"));
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  };

  const status = model?.status;
  const pct = status?.state === "downloading" ? status.pct : status?.state === "ready" ? 100 : 0;

  return (
    <div className="max-w-md space-y-5">
      <h1 className="text-lg font-semibold">Voz y modelo</h1>

      <Field label="Micrófono">
        <select
          className={inputCls}
          value={v.microphone ?? ""}
          onChange={(e) => saveConfig({ ...config, voice: { ...v, microphone: e.target.value || null } })}
        >
          <option value="">Predeterminado del sistema</option>
          {v.microphone && !mics.includes(v.microphone) && <option value={v.microphone}>{v.microphone} (no conectado)</option>}
          {mics.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <div className="space-y-2">
        <button className={btnCls} onClick={micTest} disabled={testing}>
          {testing ? "Habla ahora…" : "Probar micrófono"}
        </button>
        {peak !== null && (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
              <div className="h-full bg-green-500" style={{ width: `${Math.round(Math.min(1, peak) * 100)}%` }} />
            </div>
            <p className="text-xs text-neutral-500">
              {peak < 0.02 ? "No se oyó nada. Revisa el micrófono elegido." : `Nivel máximo: ${Math.round(peak * 100)} %`}
            </p>
          </div>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Modelo de voz local (Parakeet)</h2>
        <p className="text-xs text-neutral-500">
          Transcribe en tu PC, sin internet. Descarga única de unos {model?.sizeMb ?? 670} MB.
        </p>
        {!status ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : status.state === "ready" ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-green-700 dark:text-green-400">Listo</span>
            <button className={btnCls} onClick={() => run("delete_model")}>
              Borrar modelo
            </button>
          </div>
        ) : status.state === "downloading" ? (
          <div className="space-y-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-neutral-500">Descargando… {pct} %</p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500">No descargado</span>
            <button className={btnCls} onClick={() => run("download_model")}>
              Descargar
            </button>
          </div>
        )}
        {model?.error && status?.state !== "downloading" && <p className="text-sm text-red-600">{model.error}</p>}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
