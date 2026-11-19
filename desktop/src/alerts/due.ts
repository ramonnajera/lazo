import type { Cita, Toma } from "../api/types";
import { hora12 } from "../panels/format";

/** Aviso de una (o varias) tomas que ya tocan. Mismo instante = misma tarjeta. */
export type DosisAlert = { id: string; refId: string; kind: "dosis"; title: string; detail: string; hora: string; at: Date; toma: Toma };
/** Recordatorio de una cita (sale una sola vez, unas horas antes). */
export type CitaAlert = { id: string; refId: string; kind: "cita"; title: string; detail: string; hora: string; at: Date; cita: Cita };
export type Alert = DosisAlert | CitaAlert;

/** Con cuánta anticipación se recuerda una cita. */
export const CITA_LEAD_MS = 2 * 60 * 60_000;

const HHMM = /^(\d{2}):(\d{2})$/;

/** Fecha local a partir de `YYYY-MM-DD` y `HH:MM` (sin pasar por UTC). */
export function localDate(date: string, time: string): Date | null {
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
export function dueAlerts(tomas: Toma[], now: Date, shown: Set<string>, snoozed: Map<string, Date>): DosisAlert[] {
  const out: DosisAlert[] = [];
  for (const t of tomas) {
    if (t.estado !== "ahora" && t.estado !== "atrasada") continue;
    const id = `dosis:${claveDe(t)}`;
    if (shown.has(id)) continue;
    const until = snoozed.get(id);
    if (until && until.getTime() > now.getTime()) continue;
    const at = localDate(t.fecha, t.hora);
    if (!at) continue;
    out.push({ id, refId: t.medicamentoId, kind: "dosis", title: t.nombre, detail: t.dosis, hora: t.hora, at, toma: t });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Citas que empiezan dentro de las próximas `lead` (2 h): una sola vez por cita. El id lleva fecha y hora,
 * así una cita que se cambia de día vuelve a avisar. Las que ya empezaron no avisan.
 */
export function dueCitas(citas: Cita[], now: Date, shown: Set<string>, lead = CITA_LEAD_MS): CitaAlert[] {
  const out: CitaAlert[] = [];
  for (const c of citas) {
    const at = localDate(c.fecha, c.hora);
    if (!at) continue;
    const falta = at.getTime() - now.getTime();
    if (falta <= 0 || falta > lead) continue;
    const id = `cita:${c.id}|${c.fecha}|${c.hora}`;
    if (shown.has(id)) continue;
    out.push({ id, refId: c.id, kind: "cita", title: c.especialista || c.motivo || "tu cita", detail: c.lugar, hora: c.hora, at, cita: c });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** «en 2 horas», «en 1 hora y 15 minutos», «en 40 minutos». */
export function faltaTexto(at: Date, now: Date): string {
  const min = Math.max(1, Math.round((at.getTime() - now.getTime()) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hs = h === 1 ? "1 hora" : `${h} horas`;
  const ms = m === 1 ? "1 minuto" : `${m} minutos`;
  if (h === 0) return `en ${ms}`;
  return m === 0 ? `en ${hs}` : `en ${hs} y ${ms}`;
}

/** Lo que Lazo dice en voz alta al mostrar un aviso. */
export function fraseAviso(batch: Alert[], now: Date): string {
  const a = batch[0];
  if (!a) return "";
  if (a.kind === "cita") {
    const lugar = a.cita.lugar ? `, en ${a.cita.lugar}` : "";
    return `Recordatorio: tienes cita con ${a.title} ${faltaTexto(a.at, now)}, a las ${hora12(a.hora)}${lugar}.`;
  }
  if (batch.length > 1) return `Es hora de tus medicinas: ${batch.map((x) => x.title).join(", ")}.`;
  return `Es hora de ${a.title}${a.detail ? `, ${a.detail}` : ""}.`;
}
