const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/time');
const S = require('../src/schedule');

test('local usa UTC-6 sin importar la zona del servidor', () => {
  assert.deepEqual(T.local(new Date('2026-11-19T05:59:00Z')), { date: '2026-11-18', time: '23:59', minutes: 1439, weekday: 3 });
  assert.equal(T.local(new Date('2026-11-19T06:00:00Z')).date, '2026-11-19');
  assert.equal(T.local(new Date('2026-07-01T12:00:00Z')).time, '06:00'); // verano: sigue en -6
});

test('validDate y validTime rechazan lo imposible', () => {
  assert.ok(T.validDate('2026-02-28'));
  assert.ok(!T.validDate('2026-02-30'));
  assert.ok(!T.validDate('26-02-28'));
  assert.ok(T.validTime('00:00') && T.validTime('23:59'));
  assert.ok(!T.validTime('24:00') && !T.validTime('8:00') && !T.validTime('08:60'));
});

test('addDays cruza mes y año; weekdayOf coincide con el calendario', () => {
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(T.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(T.weekdayOf('2026-11-18'), 3); // miércoles
});

test('absMin permite restar instantes de días distintos', () => {
  assert.equal(T.absMin('2026-11-19', '00:10') - T.absMin('2026-11-18', '23:50'), 20);
  assert.deepEqual(T.fromAbsMin(T.absMin('2026-11-18', '23:50') + 20), { date: '2026-11-19', time: '00:10' });
});

const meds = [
  { id: 'a', nombre: 'Metformina', dosis: '850 mg', horarios: ['20:00', '08:00'] },
  { id: 'b', nombre: 'Losartán', dosis: '50 mg', horarios: ['08:00'], dias: [1, 3], inicio: '2026-11-10', fin: '2026-11-30' },
  { id: 'c', nombre: 'Pausado', horarios: ['09:00'], activo: false }
];

test('dosesFor respeta días, rango de fechas, activo y ordena por hora', () => {
  const miercoles = S.dosesFor(meds, '2026-11-18');
  assert.deepEqual(miercoles.map((d) => `${d.hora} ${d.nombre}`), ['08:00 Losartán', '08:00 Metformina', '20:00 Metformina']);
  assert.deepEqual(S.dosesFor(meds, '2026-11-19').map((d) => d.nombre), ['Metformina', 'Metformina']); // jueves: Losartán no toca
  assert.deepEqual(S.dosesFor(meds, '2026-12-02').map((d) => d.nombre), ['Metformina', 'Metformina']); // Losartán ya terminó
  assert.deepEqual(S.dosesFor(meds, '2026-11-04').map((d) => d.nombre), ['Metformina', 'Metformina']); // Losartán aún no empieza
});

const now = (time, date = '2026-11-18') => ({ date, time });
const dose = { medicamentoId: 'a', fecha: '2026-11-18', hora: '08:00' };

test('statusOf: pendiente → ahora → atrasada según la tolerancia', () => {
  assert.equal(S.statusOf(dose, null, now('07:59')).estado, 'pendiente');
  assert.equal(S.statusOf(dose, null, now('08:00')).estado, 'ahora');
  assert.equal(S.statusOf(dose, null, now('08:29')).estado, 'ahora');
  assert.equal(S.statusOf(dose, null, now('08:30')).estado, 'atrasada');
  assert.equal(S.statusOf(dose, null, now('08:30'), 60).estado, 'ahora'); // tolerancia configurable
});

test('statusOf: lo registrado manda; pospuesta vuelve a vencer', () => {
  assert.equal(S.statusOf(dose, { estado: 'tomada', horaReal: '08:05' }, now('12:00')).estado, 'tomada');
  assert.equal(S.statusOf(dose, { estado: 'omitida' }, now('12:00')).estado, 'omitida');
  const pospuesta = { estado: 'pospuesta', hasta: { fecha: '2026-11-18', hora: '08:20' } };
  assert.equal(S.statusOf(dose, pospuesta, now('08:10')).estado, 'pospuesta');
  assert.equal(S.statusOf(dose, pospuesta, now('08:20')).estado, 'ahora');
  assert.equal(S.statusOf(dose, pospuesta, now('08:51')).estado, 'atrasada');
});

test('statusOf cruza la medianoche', () => {
  const tarde = { medicamentoId: 'a', fecha: '2026-11-18', hora: '23:50' };
  assert.equal(S.statusOf(tarde, null, now('00:10', '2026-11-19')).estado, 'ahora');
  assert.equal(S.statusOf(tarde, null, now('00:30', '2026-11-19')).estado, 'atrasada');
});

test('nextDose prioriza lo que toca ahora, luego lo atrasado y luego lo próximo', () => {
  const data = { medicamentos: meds, tomas: [] };
  assert.equal(S.nextDose(data, { date: '2026-11-18', time: '07:00', minutes: 420, weekday: 3 }).hora, '08:00');
  assert.equal(S.nextDose(data, { date: '2026-11-18', time: '08:10', minutes: 490, weekday: 3 }).estado, 'ahora');
  const tomada = { medicamentos: meds, tomas: [{ medicamentoId: 'a', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }, { medicamentoId: 'b', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }] };
  assert.equal(S.nextDose(tomada, { date: '2026-11-18', time: '09:00', minutes: 540, weekday: 3 }).hora, '20:00');
  const fin = S.nextDose({ medicamentos: [meds[0]], tomas: [{ medicamentoId: 'a', fecha: '2026-11-18', hora: '20:00', estado: 'tomada' }, { medicamentoId: 'a', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }] }, { date: '2026-11-18', time: '21:00', minutes: 1260, weekday: 3 });
  assert.equal(fin.fecha, '2026-11-19'); // mañana por la mañana
});

test('nextDose devuelve null si no hay medicamentos', () => {
  assert.equal(S.nextDose({ medicamentos: [], tomas: [] }, { date: '2026-11-18', time: '09:00', minutes: 540, weekday: 3 }), null);
});
