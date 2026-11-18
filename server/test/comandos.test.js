const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar } = require('../src/comandos');
const X = require('../src/textos');

const tipo = (f) => interpretar(f).tipo;

test('confirmar: variantes naturales', () => {
  for (const f of ['Ya la tomé', 'ya lo tome', 'listo', 'Tomé', 'confirmo', 'Ya tomé mi pastilla']) assert.equal(tipo(f), 'tomada', f);
});

test('«no la tomaré» es omitir, no confirmar', () => {
  for (const f of ['no la tomaré', 'No la voy a tomar', 'omitir', 'saltar esta']) assert.equal(tipo(f), 'omitir', f);
});

test('posponer entiende minutos en número o palabra, con tope', () => {
  assert.deepEqual(interpretar('pospón'), { tipo: 'posponer', minutos: 10 });
  assert.equal(interpretar('pospón 15 minutos').minutos, 15);
  assert.equal(interpretar('pospón veinte minutos').minutos, 20);
  assert.equal(interpretar('más tarde, media hora').minutos, 30);
  assert.equal(interpretar('pospón cuarenta y cinco minutos').minutos, 45);
  assert.equal(interpretar('pospón 500 minutos').minutos, 180);
});

test('consultas', () => {
  assert.equal(tipo('¿Qué sigue?'), 'siguiente');
  assert.equal(tipo('cuál es la próxima'), 'siguiente');
  assert.equal(tipo('qué tengo hoy'), 'hoy');
  assert.equal(tipo('mis citas'), 'citas');
  assert.equal(tipo('convocatorias'), 'convocatorias');
  assert.equal(tipo('hay apoyos'), 'convocatorias');
  assert.equal(tipo('ayuda'), 'ayuda');
});

test('lo que no se entiende es desconocido, no una acción («tomate» no es «tomé»)', () => {
  for (const f of ['', '   ', 'qué bonito día', 'tomate', null, undefined]) assert.equal(tipo(f), 'desconocido', String(f));
});

test('horas y fechas habladas', () => {
  assert.equal(X.horaHablada('08:00'), '8 de la mañana');
  assert.equal(X.horaHablada('20:45'), '8:45 de la noche');
  assert.equal(X.horaHablada('12:00'), '12 del día');
  assert.equal(X.horaHablada('00:00'), '12 de la madrugada');
  assert.equal(X.horaHablada('15:30'), '3:30 de la tarde');
  assert.equal(X.horaCorta('20:05'), '8:05 pm');
  assert.equal(X.horaCorta('00:00'), '12:00 am');
  assert.equal(X.fechaHablada('2026-11-18', '2026-11-18'), 'hoy');
  assert.equal(X.fechaHablada('2026-11-19', '2026-11-18'), 'mañana');
  assert.equal(X.fechaHablada('2026-11-23', '2026-11-18'), 'el lunes 23 de noviembre');
});

test('frases de resumen', () => {
  const tomas = [{ nombre: 'Metformina', dosis: '850 mg', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }, { nombre: 'Losartán', dosis: '50 mg', fecha: '2026-11-18', hora: '12:00', estado: 'atrasada' }];
  assert.equal(X.fraseHoy(tomas, '2026-11-18'), 'Hoy tienes 2 tomas: ya tomaste 1 y faltan 1. Tienes atrasada la toma de Losartán, 50 mg, hoy a las 12 del día.');
  assert.equal(X.fraseHoy([], '2026-11-18'), 'Hoy no tienes tomas programadas.');
  assert.equal(X.fraseSiguiente(null, 'x'), 'No tienes tomas programadas.');
  assert.equal(X.fraseCitas([{ especialista: 'Oftalmología', fecha: '2026-11-20', hora: '09:30', lugar: 'Hospital General' }, { especialista: 'B', fecha: '2026-11-25', hora: '10:00' }], '2026-11-18'), 'Tu próxima cita es con Oftalmología, el viernes 20 de noviembre a las 9:30 de la mañana, en Hospital General. Después tienes 1 cita más más.'.replace('1 cita más más', '1 cita más'));
});
