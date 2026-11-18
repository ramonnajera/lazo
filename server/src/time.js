// time.js — fechas y horas en hora de Chihuahua (UTC-6 todo el año: no hay horario de verano desde 2022).
// Todas las fechas son 'YYYY-MM-DD' y las horas 'HH:MM'; nada depende de la zona del servidor.

const OFFSET_MIN = -6 * 60;
const pad = (n) => String(n).padStart(2, '0');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const validTime = (s) => typeof s === 'string' && TIME_RE.test(s);

/** Ahora (o `d`) en hora local: { date, time, minutes, weekday (0 = domingo) }. */
function local(d = new Date()) {
  const l = new Date(d.getTime() + OFFSET_MIN * 60000);
  return {
    date: `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`,
    time: `${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`,
    minutes: l.getUTCHours() * 60 + l.getUTCMinutes(),
    weekday: l.getUTCDay()
  };
}

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Minutos absolutos de (fecha, hora): sirve para comparar y restar instantes locales. */
function absMin(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 60000) + toMinutes(time);
}

function fromAbsMin(abs) {
  const dt = new Date(abs * 60000);
  return { date: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`, time: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}` };
}

/** Instante ISO con el desfase fijo, para quien necesite una marca absoluta. */
const iso = (date, time) => `${date}T${time}:00-06:00`;

module.exports = { validDate, validTime, local, addDays, weekdayOf, toMinutes, absMin, fromAbsMin, iso, pad };
