import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { actualizarConvocatorias } from "../api/client";
import type { Convocatoria, ListaConvocatorias } from "../api/types";
import { refreshKeys } from "./usePanelData";

function Fila({ c, nueva, abrir }: { c: Convocatoria; nueva: boolean; abrir: (url: string) => void }) {
  return (
    <div className="crow apoyo" role="group" aria-label={`${nueva ? "Nueva. " : ""}${c.nombre}. ${c.dependencia}.${c.discapacidad ? " Para personas con discapacidad." : ""}`}>
      {nueva && <span className="st st-ahora">Nueva</span>}
      <span className="txt" title={`${c.nombre} — ${c.dependencia}`}>{c.nombre}</span>
      <button type="button" className="undo" onClick={() => abrir(c.documento)} aria-label={`Abrir la convocatoria: ${c.nombre}`}>
        Abrir
      </button>
    </div>
  );
}

export function ApoyosPanel({ data }: { data: ListaConvocatorias }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nuevas = new Set(data.nuevas);
  const para = data.items.filter((i) => i.discapacidad);
  const otras = data.items.filter((i) => !i.discapacidad);
  const abrir = (url: string) => {
    openUrl(url).catch(() => setError("No pude abrir el enlace."));
  };
  const buscar = () => {
    setBusy(true);
    setError(null);
    actualizarConvocatorias()
      .then(() => refreshKeys("convocatorias"))
      .catch((e: { message?: string }) => setError(e?.message ?? "No se pudo actualizar."))
      .finally(() => setBusy(false));
  };
  return (
    <div>
      <div className="pf-head">
        <span className="pf-title">Apoyos y convocatorias</span>
        <button type="button" className="fm-b" disabled={busy} onClick={buscar}>{busy ? "Buscando…" : "Buscar nuevas"}</button>
      </div>
      {error && <div className="cempty" role="alert">{error}</div>}
      {data.error && <div className="cempty">No pude leer la página de la Secretaría ({data.error}); se muestra la última lista.</div>}
      {data.items.length === 0 && <div className="cempty">Todavía no hay convocatorias. Pulsa «Buscar nuevas».</div>}
      <div className="list-scroll">
        {para.length > 0 && <div className="cday">Para personas con discapacidad</div>}
        {para.map((c) => <Fila key={c.id} c={c} nueva={nuevas.has(c.id)} abrir={abrir} />)}
        {otras.length > 0 && <div className="cday">Otras convocatorias</div>}
        {otras.map((c) => <Fila key={c.id} c={c} nueva={nuevas.has(c.id)} abrir={abrir} />)}
      </div>
      <div className="apoyos-nota">Lazo no inventa fechas: la Secretaría no las publica en esta lista. Abre cada convocatoria para ver requisitos y fecha límite.</div>
    </div>
  );
}
