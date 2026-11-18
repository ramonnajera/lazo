// schedule.js — qué dosis tocan cada día y en qué estado van. Lógica pura: no lee ni escribe nada.

const T = require('./time');

const TOLERANCIA_MIN = 30; // pasado este tiempo sin confirmar, la dosis cuenta como atrasada

/** Dosis esperadas en `date` para los medicamentos dados, ordenadas por hora. */
function dosesFor(medicamentos, date) {
  const wd = T.weekdayOf(date);
  const out = [];
  for (const m of medicamentos) {
    if (m.activo === false) continue;
    if (m.inicio && date < m.inicio) continue;
    if (m.fin && date > m.fin) continue;
    if (Array.isArray(m.dias) && m.dias.length && !m.dias.includes(wd)) continue;
    for (const hora of m.horarios) {
      out.push({ medicamentoId: m.id, nombre: m.nombre, dosis: m.dosis || '', instrucciones: m.instrucciones || '', fecha: date, hora });
    }
  }
  return out.sort((a, b) => a.hora.localeCompare(b.hora) || a.nombre.localeCompare(b.nombre, 'es'));
}

const keyOf = (medicamentoId, fecha, hora) => `${medicamentoId}|${fecha}|${hora}`;

/**
 * Estado de una dosis:
 *  tomada | omitida (la persona lo marcó) · pospuesta (con `hasta`) ·
 *  pendiente (aún no es la hora) · ahora (ya es la hora, dentro de la tolerancia) · atrasada (sin confirmar).
 */
function statusOf(dose, toma, nowLocal, tolerancia = TOLERANCIA_MIN) {
  if (toma && (toma.estado === 'tomada' || toma.estado === 'omitida')) return { estado: toma.estado, horaReal: toma.horaReal || null };
  const due = T.absMin(dose.fecha, dose.hora);
  const now = T.absMin(nowLocal.date, nowLocal.time);
  if (toma && toma.estado === 'pospuesta' && toma.hasta) {
    const hasta = T.absMin(toma.hasta.fecha, toma.hasta.hora);
    if (now < hasta) return { estado: 'pospuesta', hasta: toma.hasta };
    return { estado: now < hasta + tolerancia ? 'ahora' : 'atrasada' };
  }
  if (now < due) return { estado: 'pendiente' };
  return { estado: now < due + tolerancia ? 'ahora' : 'atrasada' };
}

/** Dosis de un día con su estado (une el calendario con los registros de `tomas`). */
function dayView(data, date, nowLocal, tolerancia = TOLERANCIA_MIN) {
  const byKey = new Map(data.tomas.map((t) => [keyOf(t.medicamentoId, t.fecha, t.hora), t]));
  return dosesFor(data.medicamentos, date).map((d) => ({ ...d, ...statusOf(d, byKey.get(keyOf(d.medicamentoId, d.fecha, d.hora)), nowLocal, tolerancia) }));
}

/** La siguiente dosis que requiere atención: la que toca ahora, o la próxima de hoy o de los días siguientes. */
function nextDose(data, nowLocal, tolerancia = TOLERANCIA_MIN) {
  for (let i = 0; i < 8; i++) {
    const date = T.addDays(nowLocal.date, i);
    const open = dayView(data, date, nowLocal, tolerancia).filter((d) => ['ahora', 'atrasada', 'pendiente', 'pospuesta'].includes(d.estado));
    if (!open.length) continue;
    const urgent = open.find((d) => d.estado === 'ahora') || open.find((d) => d.estado === 'atrasada');
    return urgent || open[0];
  }
  return null;
}

module.exports = { dosesFor, statusOf, dayView, nextDose, keyOf, TOLERANCIA_MIN };
