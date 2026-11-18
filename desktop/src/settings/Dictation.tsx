import { useEffect, useState } from "react";
import type { Config, Replacement } from "../config/types";
import { Toggle, btnCls, inputCls } from "./ui";

interface Props {
  config: Config;
  saveConfig: (c: Config) => Promise<void>;
}

export default function Dictation({ config, saveConfig }: Props) {
  const d = config.dictation;
  const update = (patch: Partial<Config["dictation"]>) => saveConfig({ ...config, dictation: { ...d, ...patch } });

  // Borradores locales: se guardan al salir del campo, no con cada letra.
  const [words, setWords] = useState<string[]>(d.dictionary);
  const [reps, setReps] = useState<Replacement[]>(d.replacements);
  useEffect(() => setWords(d.dictionary), [d.dictionary]);
  useEffect(() => setReps(d.replacements), [d.replacements]);

  const saveWords = (w: string[]) => update({ dictionary: w.map((x) => x.trim()).filter(Boolean) });
  const saveReps = (r: Replacement[]) => update({ replacements: r.filter((x) => x.from.trim()) });

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-lg font-semibold">Dictado</h1>
      <Toggle
        label="Doble toque para manos libres (hasta el siguiente toque)"
        checked={d.handsFreeDoubleTap}
        onChange={(v) => update({ handsFreeDoubleTap: v })}
      />
      <Toggle label="Restaurar el portapapeles después de pegar" checked={d.restoreClipboard} onChange={(v) => update({ restoreClipboard: v })} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Diccionario</h2>
        <p className="text-xs text-neutral-500">Nombres y palabras que el dictado debe escribir así (corrige parecidos).</p>
        {words.map((w, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={inputCls}
              value={w}
              placeholder="Palabra"
              onChange={(e) => setWords(words.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => saveWords(words)}
            />
            <button className={btnCls} aria-label={`Quitar ${w}`} onClick={() => saveWords(words.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </div>
        ))}
        <button className={btnCls} onClick={() => setWords([...words, ""])}>
          Agregar palabra
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Reemplazos y expansiones</h2>
        <p className="text-xs text-neutral-500">Si dices la frase completa, se escribe el texto (sin distinguir mayúsculas).</p>
        {reps.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={inputCls}
              value={r.from}
              placeholder="Dices…"
              onChange={(e) => setReps(reps.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
              onBlur={() => saveReps(reps)}
            />
            <input
              className={inputCls}
              value={r.to}
              placeholder="Se escribe…"
              onChange={(e) => setReps(reps.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
              onBlur={() => saveReps(reps)}
            />
            <button className={btnCls} aria-label={`Quitar ${r.from}`} onClick={() => saveReps(reps.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </div>
        ))}
        <button className={btnCls} onClick={() => setReps([...reps, { from: "", to: "" }])}>
          Agregar reemplazo
        </button>
      </section>
    </div>
  );
}
