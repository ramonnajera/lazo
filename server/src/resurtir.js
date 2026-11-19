// resurtir.js — para cuántos días alcanzan las medicinas. Recorre el calendario real (horarios, días de la semana,
// inicio y fin), así que una medicina de lunes, miércoles y viernes o un antibiótico de 7 días se estiman bien.
// Lógica pura: no lee ni escribe nada.

const T = require('./time');
const S = require('./schedule');

const DIAS_URGENTE = 3; // alcanza para 3 días o menos → hay que resurtir ya
const HORIZONTE = 366; // más allá de un año no se estima

/** Promedio de dosis por día (con días de la semana), a un decimal. */
function porDia(m) {
  const n = m.horarios.length * (Array.isArray(m.dias) && m.dias.length ? m.dias.length / 7 : 1);
  return Math.round(n * 10) / 10;
}

/**
 * Estimación para una medicina activa con existencias:
 *  seAcaba = fecha de la primera dosis que ya no alcanza (null si alcanza hasta `fin` o más de un año)
 *  diasRestantes = días de hoy a `seAcaba` (0 = se acaba hoy)
 */
function estimarUna(data, m, now, tolerancia) {
  let quedan = m.existencias;
  let seAcaba = null;
  // Hoy cuentan las dosis aún no tomadas ni omitidas (también la atrasada: todavía puede tomarla).
  const hoy = S.dayView({ medicamentos: [m], tomas: data.tomas }, now.date, now, tolerancia).filter((d) => d.estado !== 'tomada' && d.estado !== 'omitida');
  for (const _ of hoy) {
    if (quedan <= 0) { seAcaba = now.date; break; }
    quedan--;
  }
  for (let i = 1; !seAcaba && i <= HORIZONTE; i++) {
    const fecha = T.addDays(now.date, i);
    if (m.fin && fecha > m.fin) break;
    const n = S.dosesFor([m], fecha).length;
    if (n > quedan) seAcaba = fecha;
    else quedan -= n;
  }
  const diasRestantes = seAcaba ? Math.round((T.absMin(seAcaba, '00:00') - T.absMin(now.date, '00:00')) / 1440) : null;
  return {
    id: m.id,
    nombre: m.nombre,
    dosis: m.dosis || '',
    existencias: m.existencias,
    porDia: porDia(m),
    diasRestantes,
    seAcaba,
    alcanzaHastaFin: !seAcaba && !!m.fin,
    urgente: diasRestantes !== null && diasRestantes <= DIAS_URGENTE
  };
}

/** Todas las medicinas activas con existencias registradas, la que se acaba antes primero. */
function estimar(data, now, tolerancia = S.TOLERANCIA_MIN) {
  return data.medicamentos
    .filter((m) => m.activo !== false && typeof m.existencias === 'number' && !(m.fin && m.fin < now.date))
    .map((m) => estimarUna(data, m, now, tolerancia))
    .sort((a, b) => (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity) || a.nombre.localeCompare(b.nombre, 'es'));
}

module.exports = { estimar, estimarUna, porDia, DIAS_URGENTE };
