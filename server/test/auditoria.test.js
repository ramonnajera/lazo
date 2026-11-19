// Auditoría: casos borde y validaciones que antes fallaban. Cada prueba cubre un error encontrado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { conPersona, usa, texto, modeloFalso } = require('./ayudante');
const S = require('../src/schedule');

test('medianoche: la dosis de las 23:50 sigue siendo «ahora» a las 00:05 y se puede confirmar por voz', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'Losartán', horarios: ['23:50'], existencias: 10 })).body.medicamento;
    s.clock.set('2026-11-19T06:05:00Z'); // 00:05 del 19
    const p = (await s.p('GET', '/proxima')).body.dosis;
    assert.deepEqual([p.fecha, p.hora, p.estado], ['2026-11-18', '23:50', 'ahora']);
    const r = await s.p('POST', '/voz', { texto: 'ya la tomé' });
    assert.equal(r.body.accion.hecho, true);
    assert.deepEqual([s.hogar().tomas[0].fecha, s.hogar().tomas[0].hora], ['2026-11-18', '23:50']);
    assert.equal(s.hogar().medicamentos[0].existencias, 9);
    assert.equal(med.id, s.hogar().tomas[0].medicamentoId);
  } finally { s.close(); }
});

test('medianoche: pospuesta a las 23:55 cruza al día siguiente y se puede confirmar tras las 00:00', async () => {
  const s = await conPersona();
  try {
    await s.p('POST', '/medicamentos', { nombre: 'Losartán', horarios: ['23:50'] });
    s.clock.set('2026-11-19T05:55:00Z'); // 23:55
    await s.p('POST', '/voz', { texto: 'pospón quince minutos' });
    s.clock.set('2026-11-19T06:02:00Z'); // 00:02
    assert.equal((await s.p('GET', '/proxima')).body.dosis.estado, 'pospuesta');
    assert.equal((await s.p('POST', '/voz', { texto: 'ya la tomé' })).body.accion.hecho, true);
    assert.equal(s.hogar().tomas[0].estado, 'tomada');
  } finally { s.close(); }
});

test('medianoche: la herramienta registrar_toma también alcanza la dosis de antes de las 00:00', async () => {
  const llm = modeloFalso(usa('registrar_toma', { estado: 'tomada' }), texto('Listo.'));
  const s = await conPersona({ llm });
  try {
    await s.p('POST', '/medicamentos', { nombre: 'Losartán', horarios: ['23:50'] });
    s.clock.set('2026-11-19T06:05:00Z');
    await s.p('POST', '/voz', { texto: 'acabo de tomarme la pastilla de la presión de la noche' });
    assert.equal(s.hogar().tomas[0].fecha, '2026-11-18');
  } finally { s.close(); }
});

test('posponer una dosis que aún no toca no la vuelve «atrasada» antes de su hora (ni alerta al cuidador)', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'Losartán', horarios: ['20:00'] })).body.medicamento;
    await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '20:00', estado: 'pospuesta', minutos: 10 });
    s.clock.set('2026-11-18T15:00:00Z'); // 09:00
    assert.equal((await s.p('GET', '/tomas')).body.tomas[0].estado, 'pendiente');
    assert.deepEqual((await s.p('GET', '/alertas')).body.alertas, []);
    s.clock.set('2026-11-19T02:40:00Z'); // 20:40: ahora sí, pasada la tolerancia
    assert.equal((await s.p('GET', '/tomas')).body.tomas[0].estado, 'atrasada');
  } finally { s.close(); }
});

test('statusOf: una pospuesta con «hasta» posterior a su hora sigue igual que antes', () => {
  const dose = { fecha: '2026-11-18', hora: '08:00' };
  const toma = { estado: 'pospuesta', hasta: { fecha: '2026-11-18', hora: '08:15' } };
  assert.equal(S.statusOf(dose, toma, { date: '2026-11-18', time: '08:10' }).estado, 'pospuesta');
  assert.equal(S.statusOf(dose, toma, { date: '2026-11-18', time: '08:20' }).estado, 'ahora');
  assert.equal(S.statusOf(dose, toma, { date: '2026-11-18', time: '08:50' }).estado, 'atrasada');
});

test('tomas: no se registran tomas de hace más de 30 días', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'X', horarios: ['08:00'], inicio: '2026-01-01' })).body.medicamento;
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-10-01', hora: '08:00', estado: 'tomada' })).status, 400);
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-10', hora: '08:00', estado: 'tomada' })).status, 200);
  } finally { s.close(); }
});

test('mediciones: no se aceptan del futuro (dejarían una alerta pegada y un «último valor» falso)', async () => {
  const s = await conPersona();
  try {
    const r = await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 400 }, fecha: '2026-12-01', hora: '08:00' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /futuro/);
    assert.equal((await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 100 }, fecha: '2026-11-18', hora: '09:00' })).status, 400);
    assert.equal((await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 100 }, fecha: '2026-11-18', hora: '08:04' })).status, 201); // reloj del teléfono un poco adelantado
    assert.equal((await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 100 }, fecha: '2026-11-17', hora: '21:00' })).status, 201);
  } finally { s.close(); }
});

test('perfil: cambiar una preferencia no borra las demás', async () => {
  const s = await conPersona();
  try {
    await s.p('PATCH', '/perfil', { preferencias: { textoGrande: false, voz: false } });
    const r = await s.p('PATCH', '/perfil', { preferencias: { altoContraste: true } });
    assert.deepEqual(r.body.perfil.preferencias, { textoGrande: false, altoContraste: true, voz: false });
    assert.equal((await s.p('PATCH', '/perfil', { preferencias: 'sí' })).status, 400);
  } finally { s.close(); }
});

test('perfil: los rangos solo aceptan tipos y límites conocidos con números', async () => {
  const s = await conPersona();
  try {
    assert.equal((await s.p('PATCH', '/perfil', { rangos: { glucosa: { max: 'mucho' } } })).status, 400);
    assert.equal((await s.p('PATCH', '/perfil', { rangos: { colesterol: { max: 200 } } })).status, 400);
    assert.equal((await s.p('PATCH', '/perfil', { rangos: { glucosa: { maximo: 200 } } })).status, 400);
    assert.equal((await s.p('PATCH', '/perfil', { rangos: { glucosa: 5 } })).status, 400);
    assert.equal((await s.p('PATCH', '/perfil', { rangos: { glucosa: { max: -5 } } })).status, 400);
    const ok = await s.p('PATCH', '/perfil', { rangos: { glucosa: { max: 140 }, presion: { sistolicaMax: 130 } } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.perfil.rangos, { glucosa: { max: 140 }, presion: { sistolicaMax: 130 } });
  } finally { s.close(); }
});

test('alertas/visto: id mal codificado da 400 (no 500) y un id enorme se rechaza', async () => {
  const s = await conPersona();
  try {
    const r = await s.p('POST', '/alertas/%E0%A4%A/visto');
    assert.equal(r.status, 400);
    assert.equal((await s.p('POST', `/alertas/${'a'.repeat(201)}/visto`)).status, 400);
  } finally { s.close(); }
});

test('existencias: un tratamiento que ya terminó no avisa que quedan pocas', async () => {
  const s = await conPersona();
  try {
    await s.p('POST', '/medicamentos', { nombre: 'Amoxicilina', horarios: ['08:00'], inicio: '2026-11-10', fin: '2026-11-17', existencias: 1 });
    assert.ok(!(await s.p('GET', '/alertas')).body.alertas.some((a) => a.tipo === 'existencias-bajas'));
  } finally { s.close(); }
});

test('existencias: avisa también cuando alcanzan para 3 días o menos, aunque queden más de 3 pastillas', async () => {
  const s = await conPersona();
  try {
    await s.p('POST', '/medicamentos', { nombre: 'Metformina', horarios: ['08:00', '14:00', '20:00'], existencias: 8 });
    const a = (await s.p('GET', '/alertas')).body.alertas.find((x) => x.tipo === 'existencias-bajas');
    assert.ok(a);
    assert.equal(a.detalle, 'Quedan 8: alcanzan para 2 días.');
    await s.p('POST', '/medicamentos', { nombre: 'Losartán', horarios: ['08:00'], existencias: 10 });
    assert.equal((await s.p('GET', '/alertas')).body.alertas.filter((x) => x.tipo === 'existencias-bajas').length, 1);
  } finally { s.close(); }
});

test('conversación: crear_cita no agenda en una fecha que ya pasó (el modelo se equivocó de año)', async () => {
  const llm = modeloFalso(usa('crear_cita', { especialista: 'Cardiología', fecha: '2025-11-20', hora: '09:00' }), texto('¿Me confirmas la fecha?'));
  const s = await conPersona({ llm });
  try {
    await s.p('POST', '/voz', { texto: 'agéndame cita con el cardiólogo el jueves veinte' });
    assert.equal(s.hogar().citas.length, 0);
    assert.match(llm.recibidos[1].messages.at(-1).content[0].content, /ya pasó/);
  } finally { s.close(); }
});
