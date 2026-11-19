import { IconMic } from "../ui/icons";
import { AyudaBoton } from "./Ayuda";
import { useState } from "react";
import { registrarToma } from "../api/client";
import type { Estado, Toma } from "../api/types";
import { hablar } from "../voice/habla";
import { fechaLarga, hora12, relDate } from "./format";
import { refreshKeys } from "./usePanelData";

/** El estado siempre va en palabras (y con un signo), nunca solo con color. */
export function textoEstado(t: Toma): string {
  switch (t.estado) {
    case "pendiente": return "Pendiente";
    case "ahora": return "Es la hora";
    case "atrasada": return "Atrasada";
    case "tomada": return t.horaReal ? `Tomada a las ${hora12(t.horaReal)}` : "Tomada";
    case "omitida": return "Omitida";
    case "pospuesta": return t.hasta ? `Pospuesta hasta las ${hora12(t.hasta.hora)}` : "Pospuesta";
  }
}

const SIGNO: Record<Estado, string> = { pendiente: "○", ahora: "●", atrasada: "!", tomada: "✓", omitida: "✕", pospuesta: "↻" };

export const requiereAtencion = (t: Toma) => t.estado === "ahora" || t.estado === "atrasada";

/** La toma que toca ahora, o la que sigue. */
export function siguienteToma(items: Toma[]): Toma | undefined {
  return items.find(requiereAtencion) ?? items.find((t) => t.estado === "pendiente" || t.estado === "pospuesta");
}

/**
 * Resumen del día para escucharlo de una vez (sin recorrer la lista con la vista o el lector de pantalla):
 * lo que toca ya, lo que falta con su hora y cuántas van tomadas.
 */
export function resumenDia(items: Toma[]): string {
  if (!items.length) return "Hoy no tienes tomas programadas.";
  const urgentes = items.filter(requiereAtencion);
  const faltan = items.filter((t) => t.estado === "pendiente" || t.estado === "pospuesta");
  const tomadas = items.filter((t) => t.estado === "tomada").length;
  const partes: string[] = [];
  const nom = (t: Toma) => `${t.nombre}${t.dosis ? ` ${t.dosis}` : ""}`;
  if (urgentes.length) partes.push(`Ya toca: ${urgentes.map((t) => `${nom(t)}, de las ${hora12(t.hora)}`).join("; ")}.`);
  if (faltan.length) partes.push(`${faltan.length === 1 ? "Falta" : `Faltan ${faltan.length} tomas`}: ${faltan.map((t) => `${nom(t)} a las ${hora12(t.estado === "pospuesta" && t.hasta ? t.hasta.hora : t.hora)}`).join("; ")}.`);
  if (!urgentes.length && !faltan.length) partes.push("Todo al día: no te falta ninguna toma.");
  partes.push(tomadas === 1 ? "Llevas 1 tomada." : `Llevas ${tomadas} tomadas.`);
  return partes.join(" ");
}

/** `corto`: en la lista solo cabe «Tomada»; el detalle (la hora) va en la tarjeta grande y en el texto para lectores de pantalla. */
export function Chip({ t, corto = false }: { t: Toma; corto?: boolean }) {
  const texto = corto ? textoEstado(t).split(" ")[0] : textoEstado(t);
  return (
    <span className={`st st-${t.estado}`} title={textoEstado(t)}>
      <span aria-hidden>{SIGNO[t.estado]}</span> {texto}
    </span>
  );
}

export function HoyPanel({ items, today, onTalk }: { items: Toma[]; today: string; onTalk?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sig = siguienteToma(items);
  const urgente = !!sig && requiereAtencion(sig);

  const actuar = (t: Toma, estado: Estado, minutos?: number, frase?: string) => {
    setBusy(true);
    setError(null);
    registrarToma(t, estado, minutos)
      .then(() => {
        refreshKeys("tomas");
        if (frase) hablar(frase);
      })
      .catch((e: { message?: string }) => setError(e?.message ?? "No se pudo guardar. Reintenta."))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      {/* «Necesito ayuda» va arriba: siempre a la vista, sin desplazar la sección. */}
      <AyudaBoton>
        <span className="hoy-head-l">
          <span className="pf-title">Hoy</span>
          <span className="hoy-date">{fechaLarga(today)}</span>
        </span>
      </AyudaBoton>
      {onTalk && (
        <button type="button" className="talk-row" onClick={onTalk} aria-label="Hablar con Lazo. Pregunta o di: ya la tomé.">
          <span className="talk-ic" aria-hidden><IconMic /></span>
          <span>
            <span className="talk-t">Hablar con Lazo</span>
            <br />
            <span className="talk-s">Pregunta o di «ya la tomé»</span>
          </span>
        </button>
      )}
      {error && <div className="cempty" role="alert">{error}</div>}
      {sig ? (
        <section className={`hoy-card${urgente ? " urgent" : ""}`} aria-label={`${urgente ? "Es hora de" : "Siguiente toma:"} ${sig.nombre} ${sig.dosis}, ${relDate(sig.fecha, today)} ${hora12(sig.hora)}. ${textoEstado(sig)}`}>
          <div className="hoy-kicker">{urgente ? "Es hora de tu medicina" : "Siguiente toma"}</div>
          <div className="hoy-name">{sig.nombre}</div>
          <div className="hoy-dose">{[sig.dosis, `${relDate(sig.fecha, today)} · ${hora12(sig.hora)}`].filter(Boolean).join(" · ")}</div>
          {sig.instrucciones && <div className="hoy-note">{sig.instrucciones}</div>}
          <Chip t={sig} />
          <div className="hoy-btns">
            <button type="button" className="fm-b pri" disabled={busy} onClick={() => actuar(sig, "tomada", undefined, `Listo. Registré ${sig.nombre} como tomada.`)}>
              Ya la tomé
            </button>
            <button type="button" className="fm-b" disabled={busy} onClick={() => actuar(sig, "pospuesta", 10, "Te lo recuerdo en 10 minutos.")}>
              Pospón 10 min
            </button>
            <button type="button" className="fm-b" disabled={busy} onClick={() => actuar(sig, "omitida")}>
              Omitir
            </button>
          </div>
        </section>
      ) : (
        <div className="cempty">{items.length ? "Todo al día: no tienes tomas pendientes hoy." : "Hoy no tienes tomas programadas."}</div>
      )}
      {items.length > 0 && (
        <div className="hoy-sub">
          <span>Tomas de hoy</span>
          <button type="button" className="fm-small" onClick={() => hablar(resumenDia(items), { forzar: true })} aria-label="Escuchar mi día: leer en voz alta las tomas de hoy">
            Escuchar mi día
          </button>
        </div>
      )}
      <div className="list-scroll">
        {items.map((t) => (
          <div key={`${t.medicamentoId}|${t.fecha}|${t.hora}`} className="crow" role="group" aria-label={`${hora12(t.hora)}, ${t.nombre} ${t.dosis}. ${textoEstado(t)}`}>
            <span className="lt">{hora12(t.hora)}</span>
            <span className="txt" title={`${t.nombre} ${t.dosis}`}>{t.nombre}{t.dosis ? ` · ${t.dosis}` : ""}</span>
            <Chip t={t} corto />
            {(t.estado === "tomada" || t.estado === "omitida") && (
              <button type="button" className="undo" disabled={busy} onClick={() => actuar(t, "pendiente")} aria-label={`Deshacer: ${t.nombre} de las ${hora12(t.hora)}`}>
                Deshacer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
