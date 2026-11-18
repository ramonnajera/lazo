import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Alias, CommandsCfg, Config } from "../config/types";
import { Toggle, btnCls, fieldCls, inputCls } from "./ui";

interface Props {
  config: Config;
  saveConfig: (c: Config) => Promise<void>;
}

interface Row {
  name: string;
  target: string;
}

export const WEB_URL_ERROR = "Dirección no válida: debe empezar con http:// o https://";

/** Igual que exec::is_web_url en Rust: solo http(s) con algo después del esquema. */
export function isWebUrl(u: string): boolean {
  const m = /^https?:\/\/(.+)$/i.exec(u.trim());
  return !!m && m[1].trim().length > 0;
}

const webUrl = (t: string) => (isWebUrl(t) ? null : WEB_URL_ERROR);
const searchUrl = (t: string) => webUrl(t) ?? (t.includes("{q}") ? null : "La dirección debe incluir {q}");

const clean = (r: Row): Row => ({ name: r.name.trim(), target: r.target.trim() });

/** Filas que se guardan: completas y válidas. Las demás se quedan solo en el borrador. */
function savable(draft: Row[], validate?: (t: string) => string | null): Row[] {
  return draft.map(clean).filter((r) => r.name && r.target && !validate?.(r.target));
}

const same = (a: Row[], b: Row[]) => a.length === b.length && a.every((x, i) => x.name === b[i].name && x.target === b[i].target);

/** Tabla editable de pares nombre → destino; guarda al salir del campo las filas completas. */
function PairTable({
  title,
  hint,
  rows,
  targetLabel,
  onSave,
  validate,
  extra,
}: {
  title: string;
  hint: string;
  rows: Row[];
  targetLabel: string;
  onSave: (rows: Row[]) => void;
  validate?: (target: string) => string | null;
  extra?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Row[]>(rows);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Solo se resincroniza si lo guardado cambió de verdad (no al guardar lo mismo que hay en el borrador).
  useEffect(() => {
    if (!same(rows.map(clean), savable(draftRef.current, validate))) setDraft(rows);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (d: Row[]) => {
    // Una fila completa con dirección inválida detiene el guardado (si no, se borraría la fila guardada).
    if (d.map(clean).some((r) => r.name && r.target && validate?.(r.target))) return;
    const out = savable(d, validate);
    if (!same(out, rows.map(clean))) onSave(out);
  };
  const edit = (i: number, patch: Partial<Row>) => setDraft(draft.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const blur = (i: number) => {
    setTouched(new Set(touched).add(i));
    save(draft);
  };

  return (
    <section className="space-y-2" data-table={title}>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-xs text-neutral-500">{hint}</p>
      {draft.map((r, i) => {
        const err = touched.has(i) && r.target.trim() ? validate?.(r.target.trim()) : null;
        return (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <input className={`${fieldCls} w-36 shrink-0`} value={r.name} placeholder="Nombre" aria-label={`Nombre ${i + 1}`} onChange={(e) => edit(i, { name: e.target.value })} onBlur={() => blur(i)} />
              <input
                className={`${fieldCls} min-w-0 flex-1`}
                value={r.target}
                placeholder={targetLabel}
                aria-label={`${targetLabel} ${i + 1}`}
                aria-invalid={!!err}
                onChange={(e) => edit(i, { target: e.target.value })}
                onBlur={() => blur(i)}
              />
              <button
                className={`${btnCls} shrink-0`}
                aria-label={`Quitar ${r.name}`}
                onClick={() => {
                  const d = draft.filter((_, j) => j !== i);
                  setDraft(d);
                  setTouched(new Set());
                  save(d);
                }}
              >
                Quitar
              </button>
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button className={btnCls} onClick={() => setDraft([...draft, { name: "", target: "" }])}>
          Agregar
        </button>
        {extra}
      </div>
    </section>
  );
}

/** Lista de accesos directos del menú Inicio con filtro. */
function StartMenuPicker({ onPick }: { onPick: (a: Alias) => void }) {
  const [items, setItems] = useState<Alias[] | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (!open && items === null) {
      invoke<Alias[]>("start_menu_list")
        .then(setItems)
        .catch(() => setError("No pude leer el menú Inicio"));
    }
    setOpen(!open);
  };
  const shown = (items ?? []).filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <button className={btnCls} onClick={toggle}>
        Agregar desde el menú Inicio
      </button>
      {open && (
        <div className="w-full space-y-2 rounded-md border border-neutral-300 p-2 dark:border-neutral-600">
          <input className={inputCls} placeholder="Buscar programa…" value={q} onChange={(e) => setQ(e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {items === null && !error && <p className="text-xs text-neutral-500">Cargando…</p>}
          <ul className="max-h-56 overflow-y-auto text-sm">
            {shown.map((a) => (
              <li key={a.target}>
                <button
                  className="w-full rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => {
                    onPick(a);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function Commands({ config, saveConfig }: Props) {
  const c = config.commands;
  const update = (patch: Partial<CommandsCfg>) => saveConfig({ ...config, commands: { ...c, ...patch } });
  const engines = useMemo(() => c.searchEngines.map((e) => ({ name: e.name, target: e.urlTemplate })), [c.searchEngines]);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold">Órdenes</h1>
      <p className="text-sm text-neutral-500">
        Con la tecla de Lazo: «abre youtube», «abre descargas», «busca lofi en youtube», «sube el volumen», «pausa», «bloquea la
        computadora». Lo demás se le pregunta a Lazo.
      </p>

      <PairTable title="Sitios" hint="«abre youtube» abre la dirección." rows={c.sites} targetLabel="Dirección (https://…)" validate={webUrl} onSave={(sites) => update({ sites })} />

      <PairTable
        title="Programas"
        hint="«abre spotify» abre el programa o acceso directo."
        rows={c.programs}
        targetLabel="Ruta del programa o .lnk"
        onSave={(programs) => update({ programs })}
        extra={
          <StartMenuPicker
            onPick={(a) => {
              if (!c.programs.some((p) => p.name.toLowerCase() === a.name.toLowerCase())) update({ programs: [...c.programs, a] });
            }}
          />
        }
      />

      <PairTable title="Carpetas" hint="«abre descargas». Puedes usar %USERPROFILE%." rows={c.folders} targetLabel="Ruta de la carpeta" onSave={(folders) => update({ folders })} />

      <PairTable
        title="Buscadores"
        hint="«busca X en youtube». {q} se reemplaza por lo que buscas."
        rows={engines}
        targetLabel="Dirección con {q}"
        validate={searchUrl}
        onSave={(rows) => update({ searchEngines: rows.map((r) => ({ name: r.name, urlTemplate: r.target })) })}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Sistema</h2>
        <Toggle label="Permitir bloquear, suspender y apagar por voz" checked={c.systemEnabled} onChange={(v) => update({ systemEnabled: v })} />
        <Toggle label="Pedir confirmación antes de suspender o apagar" checked={c.confirmPower} onChange={(v) => update({ confirmPower: v })} />
      </section>
    </div>
  );
}
