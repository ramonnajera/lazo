// Resurtir: cuántos días alcanzan las medicinas, siguiendo el calendario real (horarios, días de la semana y fin).
const test = require('node:test');
const assert = require('node:assert/strict');
const { conPersona, usa, texto, modeloFalso } = require('./ayudante');
const { estimar } = require('../src/resurtir');

const ahora = (time = '08:00', date = '2026-11-18') => ({ date, time });

test('estimar: cuenta las dosis que faltan hoy y las de los días siguientes', () => {
  const data = { tomas: [], medicamentos: [{ id: 'm1', nombre: 'Metformina', horarios: ['08:00', '14:00', '20:00'], existencias: 8, inicio: '2026-11-01' }] };
  const [r] = estimar(data, ahora());
  // hoy 3, mañana 3, pasado 2 (la de las 20:00 del 20 ya no alcanza)
  assert.deepEqual(r, { id: 'm1', nombre: 'Metformina', dosis: '', existencias: 8, porDia: 3, diasRestantes: 2, seAcaba: '2026-11-20', alcanzaHastaFin: false, urgente: true });
});

test('estimar: lo ya tomado hoy no se vuelve a contar', () => {
  const data = { tomas: [{ medicamentoId: 'm1', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }], medicamentos: [{ id: 'm1', nombre: 'X', horarios: ['08:00', '20:00'], existencias: 2, inicio: '2026-11-01' }] };
  const [r] = estimar(data, ahora('09:00'));
  assert.equal(r.seAcaba, '2026-11-19'); // hoy 20:00 y mañana 08:00; la de mañana 20:00 ya no
  assert.equal(r.diasRestantes, 1);
});

test('estimar: respeta los días de la semana y el fin del tratamiento', () => {
  // lunes, miércoles y viernes (1, 3, 5); hoy es miércoles 18
  const lmv = { id: 'm1', nombre: 'Semanal', horarios: ['08:00'], dias: [1, 3, 5], existencias: 3, inicio: '2026-11-01' };
  const corto = { id: 'm2', nombre: 'Antibiótico', horarios: ['08:00', '20:00'], existencias: 6, inicio: '2026-11-01', fin: '2026-11-19' };
  const sinDato = { id: 'm3', nombre: 'Sin conteo', horarios: ['08:00'], inicio: '2026-11-01' };
  const inactiva = { id: 'm4', nombre: 'Pausada', horarios: ['08:00'], existencias: 1, activo: false, inicio: '2026-11-01' };
  const lista = estimar({ tomas: [], medicamentos: [lmv, corto, sinDato, inactiva] }, ahora());
  assert.deepEqual(lista.map((r) => r.id), ['m1', 'm2']); // solo las activas con existencias; la más urgente primero
  assert.equal(lista[0].porDia, 0.4); // 3 por semana
  assert.equal(lista[0].seAcaba, '2026-11-25'); // mié 18, vie 20, lun 23; el mié 25 ya no
  assert.equal(lista[0].diasRestantes, 7);
  assert.equal(lista[0].urgente, false);
  assert.deepEqual([lista[1].seAcaba, lista[1].diasRestantes, lista[1].alcanzaHastaFin, lista[1].urgente], [null, null, true, false]);
});

test('estimar: sin existencias es «se acaba hoy» y urgente', () => {
  const [r] = estimar({ tomas: [], medicamentos: [{ id: 'm1', nombre: 'X', horarios: ['20:00'], existencias: 0, inicio: '2026-11-01' }] }, ahora());
  assert.deepEqual([r.seAcaba, r.diasRestantes, r.urgente], ['2026-11-18', 0, true]);
});

test('GET /resurtir: la persona y el cuidador la consultan; el número baja al confirmar tomas', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'Losartán', dosis: '50 mg', horarios: ['08:00'], existencias: 10 })).body.medicamento;
    const ct = await s.cuidador();
    const a = (await s.call('GET', '/resurtir', { token: ct })).body;
    assert.deepEqual(a.medicamentos.map((m) => [m.nombre, m.existencias, m.diasRestantes, m.seAcaba]), [['Losartán', 10, 10, '2026-11-28']]);
    await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'tomada' });
    const b = (await s.p('GET', '/resurtir')).body.medicamentos[0];
    assert.deepEqual([b.existencias, b.diasRestantes, b.seAcaba], [9, 10, '2026-11-28']); // la de hoy ya salió del frasco: misma fecha
    assert.equal((await s.call('GET', '/resurtir')).status, 401);
  } finally { s.close(); }
});

test('conversación: consultar_medicinas dice para cuántos días alcanzan', async () => {
  const llm = modeloFalso(usa('consultar_medicinas', {}), texto('Te alcanzan para 10 días.'));
  const s = await conPersona({ llm });
  try {
    await s.p('POST', '/medicamentos', { nombre: 'Losartán', horarios: ['08:00'], existencias: 10 });
    await s.p('POST', '/voz', { texto: 'para cuántos días me alcanza la pastilla de la presión' });
    const salida = JSON.parse(llm.recibidos[1].messages.at(-1).content[0].content);
    assert.equal(salida.medicinas[0].alcanza_para_dias, 10);
    assert.equal(salida.medicinas[0].se_acaba, '2026-11-28');
  } finally { s.close(); }
});
