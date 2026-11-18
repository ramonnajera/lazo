// textos.js — frases para leer en voz alta (mismas reglas que la app Android: español de México, sin abreviaturas).

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const T = require('./time');

const plural = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** «20:05» → «8:05 de la noche». */
function horaHablada(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const periodo = h <= 5 ? 'de la madrugada' : h <= 11 ? 'de la mañana' : h === 12 ? 'del día' : h <= 18 ? 'de la tarde' : 'de la noche';
  return `${h12}${m === 0 ? '' : `:${String(m).padStart(2, '0')}`} ${periodo}`;
}

/** «20:05» → «8:05 pm». */
function horaCorta(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const nombreDia = (fecha) => DIAS[(T.weekdayOf(fecha) + 6) % 7];

/** «hoy», «mañana», «ayer» o «el lunes 23 de noviembre». */
function fechaHablada(fecha, hoy) {
  if (fecha === hoy) return 'hoy';
  if (fecha === T.addDays(hoy, 1)) return 'mañana';
  if (fecha === T.addDays(hoy, -1)) return 'ayer';
  const [, m, d] = fecha.split('-').map(Number);
  return `el ${nombreDia(fecha)} ${d} de ${MESES[m - 1]}`;
}

const textoDosis = (nombre, dosis) => (dosis && dosis.trim() ? `${nombre}, ${dosis}` : nombre);

const requiereAtencion = (e) => e === 'ahora' || e === 'atrasada';

function fraseSiguiente(d, hoy) {
  if (!d) return 'No tienes tomas programadas.';
  const cuando = d.estado === 'ahora' ? 'Es la hora de' : d.estado === 'atrasada' ? 'Tienes atrasada la toma de' : 'La siguiente es';
  return `${cuando} ${textoDosis(d.nombre, d.dosis)}, ${fechaHablada(d.fecha, hoy)} a las ${horaHablada(d.hora)}.`;
}

function fraseHoy(tomas, hoy) {
  if (!tomas.length) return 'Hoy no tienes tomas programadas.';
  const hechas = tomas.filter((t) => t.estado === 'tomada').length;
  const faltan = tomas.filter((t) => t.estado !== 'tomada' && t.estado !== 'omitida').length;
  const sig = tomas.find((t) => requiereAtencion(t.estado) || t.estado === 'pendiente' || t.estado === 'pospuesta');
  const resumen = `Hoy tienes ${plural(tomas.length, 'toma', 'tomas')}: ya tomaste ${hechas} y faltan ${faltan}.`;
  return sig ? `${resumen} ${fraseSiguiente(sig, hoy)}` : resumen;
}

function fraseCitas(citas, hoy) {
  if (!citas.length) return 'No tienes citas próximas.';
  const c = citas[0];
  const extra = citas.length > 1 ? ` Después tienes ${plural(citas.length - 1, 'cita más', 'citas más')}.` : '';
  return `Tu próxima cita es con ${c.especialista}, ${fechaHablada(c.fecha, hoy)} a las ${horaHablada(c.hora)}${c.lugar ? `, en ${c.lugar}` : ''}.${extra}`;
}

module.exports = { plural, horaHablada, horaCorta, fechaHablada, textoDosis, requiereAtencion, fraseSiguiente, fraseHoy, fraseCitas };
