import type { Toma } from "../api/types";

/** Aviso de una (o varias) tomas que ya tocan. Mismo instante = misma tarjeta. */
export type Alert = { id: string; refId: string; kind: "dosis"; title: string; detail: string; at: Date; toma: Toma };

const HHMM = /^(\d{2}):(\d{2})$/;

/** Fecha local a partir de `YYYY-MM-DD` y `HH:MM` (sin pasar por UTC). */
function localDate(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = HHMM.exec(time);
  if (!d || !t) return null;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
}

export const claveDe = (t: Pick<Toma, "medicamentoId" | "fecha" | "hora">) => `${t.medicamentoId}|${t.fecha}|${t.hora}`;

/**
 * Avisos que toca mostrar ahora: las tomas que el servidor marca «ahora» o «atrasada» y que no se han mostrado ni
 * están pospuestas. Función pura: `now` se inyecta. Cada toma avisa una sola vez (hasta que se pospone).
 */
export function dueAlerts(tomas: Toma[], now: Date, shown: Set<string>, snoozed: Map<string, Date>): Alert[] {
  const out: Alert[] = [];
  for (const t of tomas) {
    if (t.estado !== "ahora" && t.estado !== "atrasada") continue;
    const id = `dosis:${claveDe(t)}`;
    if (shown.has(id)) continue;
    const until = snoozed.get(id);
    if (until && until.getTime() > now.getTime()) continue;
    const at = localDate(t.fecha, t.hora);
    if (!at) continue;
    out.push({ id, refId: t.medicamentoId, kind: "dosis", title: t.nombre, detail: t.dosis, at, toma: t });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
