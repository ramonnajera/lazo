const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'convocatorias.html'), 'utf8');

/** Servidor de prueba con reloj que se puede mover. `clock.set('2026-11-18T14:00:00Z')` (UTC; local = UTC-6). */
async function arrancar({ dataFile = null, html = FIXTURE } = {}) {
  const clock = { t: new Date('2026-11-18T14:00:00Z') }; // 08:00 en Chihuahua
  clock.set = (iso) => { clock.t = new Date(iso); };
  const app = createApp({ dataFile, now: () => new Date(clock.t), fetchHtml: async () => html, convUrl: 'https://ejemplo.test/convocatorias' });
  const srv = http.createServer(app.handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, { token, body, raw } = {}) => {
    const res = await fetch(base + p, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body || raw ? { 'Content-Type': 'application/json' } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { app, clock, call, close: () => { srv.closeAllConnections(); srv.close(); } };
}

/** Servidor ya configurado con una persona y su token. */
async function conPersona(opts) {
  const s = await arrancar(opts);
  const r = await s.call('POST', '/perfil', { body: { nombre: 'Ana Ejemplo', discapacidad: 'visual' } });
  s.token = r.body.token;
  s.p = (m, p, body) => s.call(m, p, { token: s.token, body });
  return s;
}

test('primer arranque: /health sin configurar, /perfil crea la persona una sola vez', async () => {
  const s = await arrancar();
  try {
    assert.deepEqual((await s.call('GET', '/health')).body, { ok: true, version: '1.0.0', configurado: false });
    const mal = await s.call('POST', '/perfil', { body: { discapacidad: 'visual' } });
    assert.equal(mal.status, 400);
    assert.match(mal.body.error, /nombre/);
    assert.equal((await s.call('POST', '/perfil', { body: { nombre: 'X', discapacidad: 'sorda' } })).status, 400);
    const ok = await s.call('POST', '/perfil', { body: { nombre: 'Ana Ejemplo', discapacidad: 'motriz' } });
    assert.equal(ok.status, 201);
    assert.match(ok.body.token, /^lzo_[0-9a-f]{48}$/);
    assert.deepEqual(ok.body.perfil.preferencias, { textoGrande: true, altoContraste: false, voz: true });
    assert.equal(ok.body.perfil.tolerancia, 30);
    assert.equal((await s.call('POST', '/perfil', { body: { nombre: 'Otra' } })).status, 409);
    assert.equal((await s.call('GET', '/health')).body.configurado, true);
  } finally { s.close(); }
});

test('autenticación: sin token 401, token inválido 401, ruta inexistente 404, método 405', async () => {
  const s = await conPersona();
  try {
    assert.equal((await s.call('GET', '/medicamentos')).status, 401);
    assert.equal((await s.call('GET', '/medicamentos', { token: 'lzo_falso' })).status, 401);
    assert.equal((await s.p('GET', '/medicamentos')).status, 200);
    assert.equal((await s.p('GET', '/nada')).status, 404);
    assert.equal((await s.p('PUT', '/medicamentos')).status, 405);
  } finally { s.close(); }
});

test('el token no se guarda en claro en el archivo de datos', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lazo-')), 'datos.json');
  const s = await conPersona({ dataFile: f });
  try {
    assert.ok(!fs.readFileSync(f, 'utf8').includes(s.token));
    assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  } finally { s.close(); }
});

test('los datos persisten al reiniciar el servidor', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lazo-')), 'datos.json');
  const a = await conPersona({ dataFile: f });
  await a.p('POST', '/citas', { especialista: 'Oftalmología', fecha: '2026-11-25', hora: '10:00' });
  const token = a.token;
  a.close();
  const b = await arrancar({ dataFile: f });
  try {
    const r = await b.call('GET', '/citas', { token });
    assert.equal(r.body.citas[0].especialista, 'Oftalmología');
  } finally { b.close(); }
});

test('medicamentos: validación, inicio por omisión hoy, edición y borrado (con sus tomas)', async () => {
  const s = await conPersona();
  try {
    assert.equal((await s.p('POST', '/medicamentos', { nombre: 'X', horarios: [] })).status, 400);
    assert.equal((await s.p('POST', '/medicamentos', { nombre: 'X', horarios: ['25:00'] })).status, 400);
    assert.equal((await s.p('POST', '/medicamentos', { nombre: '', horarios: ['08:00'] })).status, 400);
    assert.equal((await s.p('POST', '/medicamentos', { nombre: 'X', horarios: ['08:00'], dias: [7] })).status, 400);
    assert.equal((await s.p('POST', '/medicamentos', { nombre: 'X', horarios: ['08:00'], inicio: '2026-11-18', fin: '2026-11-01' })).status, 400);
    const r = await s.p('POST', '/medicamentos', { nombre: 'Metformina', dosis: '850 mg', horarios: ['20:00', '08:00', '08:00'], existencias: 5 });
    assert.equal(r.status, 201);
    const med = r.body.medicamento;
    assert.deepEqual(med.horarios, ['08:00', '20:00']);
    assert.equal(med.inicio, '2026-11-18');
    const e = await s.p('PATCH', `/medicamentos/${med.id}`, { dosis: '500 mg', horarios: ['09:00'] });
    assert.equal(e.body.medicamento.dosis, '500 mg');
    assert.equal(e.body.medicamento.nombre, 'Metformina');
    assert.equal((await s.p('PATCH', '/medicamentos/aaaaaaaaaa', { dosis: 'x' })).status, 404);
    await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '09:00', estado: 'tomada' });
    assert.equal((await s.p('DELETE', `/medicamentos/${med.id}`)).status, 200);
    assert.equal(s.app.store.data.tomas.length, 0);
    assert.deepEqual((await s.p('GET', '/medicamentos')).body.medicamentos, []);
  } finally { s.close(); }
});

test('tomas: confirmar, existencias, deshacer, posponer y dosis inexistentes', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'Losartán', dosis: '50 mg', horarios: ['08:00', '20:00'], existencias: 3 })).body.medicamento;
    const v1 = (await s.p('GET', '/tomas')).body;
    assert.deepEqual(v1.tomas.map((t) => `${t.hora}:${t.estado}`), ['08:00:ahora', '20:00:pendiente']);
    const t1 = await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'tomada' });
    assert.equal(t1.body.toma.estado, 'tomada');
    assert.equal(t1.body.toma.horaReal, '08:00');
    assert.equal(t1.body.existencias, 2);
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'tomada' })).body.existencias, 2); // idempotente
    const u = await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'pendiente' });
    assert.equal(u.body.existencias, 3); // deshacer devuelve la dosis
    assert.equal(u.body.toma.estado, 'ahora');
    const p = await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'pospuesta', minutos: 15 });
    assert.equal(p.body.toma.estado, 'pospuesta');
    assert.deepEqual(p.body.toma.hasta, { fecha: '2026-11-18', hora: '08:15' });
    assert.deepEqual((await s.p('GET', '/tomas')).body.ahora, { fecha: '2026-11-18', hora: '08:00' });
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'pospuesta', minutos: 2 })).status, 400);
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '12:00', estado: 'tomada' })).status, 404);
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'quizá' })).status, 400);
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-12-30', hora: '08:00', estado: 'tomada' })).status, 400);
    assert.equal((await s.p('POST', '/tomas', { medicamentoId: 'aaaaaaaaaa', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' })).status, 404);
  } finally { s.close(); }
});

test('existencias nunca bajan de cero', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'X', horarios: ['08:00', '09:00'], existencias: 1 })).body.medicamento;
    await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'tomada' });
    const r = await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '09:00', estado: 'tomada' });
    assert.equal(r.body.existencias, 0);
  } finally { s.close(); }
});

test('/proxima sigue al reloj: ahora, luego la de la noche, luego mañana', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'Losartán', horarios: ['08:00', '20:00'] })).body.medicamento;
    assert.equal((await s.p('GET', '/proxima')).body.dosis.estado, 'ahora');
    await s.p('POST', '/tomas', { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'tomada' });
    const n = (await s.p('GET', '/proxima')).body.dosis;
    assert.deepEqual([n.hora, n.estado], ['20:00', 'pendiente']);
    s.clock.set('2026-11-19T03:00:00Z'); // 21:00 local: la de las 20:00 sin confirmar → atrasada
    assert.equal((await s.p('GET', '/proxima')).body.dosis.estado, 'atrasada');
  } finally { s.close(); }
});

test('citas: validación, orden cronológico, solo próximas por omisión', async () => {
  const s = await conPersona();
  try {
    assert.equal((await s.p('POST', '/citas', { especialista: 'X', fecha: '2026-13-01', hora: '10:00' })).status, 400);
    assert.equal((await s.p('POST', '/citas', { fecha: '2026-11-25', hora: '10:00' })).status, 400);
    await s.p('POST', '/citas', { especialista: 'B', fecha: '2026-11-25', hora: '10:00', lugar: 'Hospital', transporte: 'Taxi adaptado' });
    const a = (await s.p('POST', '/citas', { especialista: 'A', fecha: '2026-11-20', hora: '09:00' })).body.cita;
    await s.p('POST', '/citas', { especialista: 'Pasada', fecha: '2026-11-01', hora: '09:00' });
    assert.deepEqual((await s.p('GET', '/citas')).body.citas.map((c) => c.especialista), ['A', 'B']);
    assert.equal((await s.p('GET', '/citas?todas=1')).body.citas.length, 3);
    assert.equal((await s.p('PATCH', `/citas/${a.id}`, { hora: '11:30' })).body.cita.hora, '11:30');
    assert.equal((await s.p('DELETE', `/citas/${a.id}`)).status, 200);
    assert.equal((await s.p('DELETE', `/citas/${a.id}`)).status, 404);
  } finally { s.close(); }
});

test('mediciones: se validan, avisan si salen de rango y se listan recientes primero', async () => {
  const s = await conPersona();
  try {
    assert.equal((await s.p('POST', '/mediciones', { tipo: 'presion', valor: { sistolica: 120 } })).status, 400);
    assert.equal((await s.p('POST', '/mediciones', { tipo: 'fiebre', valor: { c: 38 } })).status, 400);
    const normal = await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 100 } });
    assert.equal(normal.status, 201);
    assert.equal(normal.body.aviso, null);
    assert.equal(normal.body.medicion.texto, '100 mg/dL');
    s.clock.set('2026-11-18T16:00:00Z');
    const alta = await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 260 }, nota: 'después de comer' });
    assert.equal(alta.body.aviso.nivel, 'media');
    const lista = (await s.p('GET', '/mediciones?tipo=glucosa')).body.mediciones;
    assert.deepEqual(lista.map((m) => m.valor.mgdl), [260, 100]);
    assert.equal(lista[0].aviso.nivel, 'media');
    assert.equal((await s.p('GET', '/mediciones?dias=0')).status, 400);
    assert.equal((await s.p('DELETE', `/mediciones/${lista[0].id}`)).status, 200);
  } finally { s.close(); }
});

test('círculo: invitar, unirse, el cuidador solo lee, ve el resumen y puede ser revocado', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'Losartán', dosis: '50 mg', horarios: ['08:00'] })).body.medicamento;
    const inv = await s.p('POST', '/circulo/invitacion');
    assert.match(inv.body.codigo, /^\d{6}$/);
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: '000000', nombre: 'Luis' } })).status, 404);
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: inv.body.codigo } })).status, 400);
    const u = await s.call('POST', '/circulo/unirse', { body: { codigo: inv.body.codigo, nombre: 'Luis Ejemplo', parentesco: 'Hijo' } });
    assert.equal(u.status, 201);
    assert.equal(u.body.persona.nombre, 'Ana Ejemplo');
    const ct = u.body.token;
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: inv.body.codigo, nombre: 'Otro' } })).status, 404); // un solo uso

    assert.equal((await s.call('GET', '/medicamentos', { token: ct })).status, 200);
    assert.equal((await s.call('POST', '/medicamentos', { token: ct, body: { nombre: 'X', horarios: ['08:00'] } })).status, 403);
    assert.equal((await s.call('POST', '/tomas', { token: ct, body: { medicamentoId: med.id, fecha: '2026-11-18', hora: '08:00', estado: 'tomada' } })).status, 403);
    assert.equal((await s.call('POST', '/circulo/invitacion', { token: ct })).status, 403);
    assert.equal((await s.call('GET', '/circulo', { token: ct })).status, 403);
    assert.equal((await s.call('POST', '/convocatorias/actualizar', { token: ct })).status, 403);

    s.clock.set('2026-11-18T15:00:00Z'); // 09:00: la toma de las 08:00 sin confirmar
    const r = (await s.call('GET', '/circulo/resumen', { token: ct })).body;
    assert.equal(r.persona.nombre, 'Ana Ejemplo');
    assert.equal(r.alertas[0].tipo, 'dosis-atrasada');
    assert.equal(r.adherencia.porDia.length, 7);
    const visto = await s.call('POST', `/alertas/${encodeURIComponent(r.alertas[0].id)}/visto`, { token: ct });
    assert.equal(visto.status, 200);
    assert.deepEqual((await s.call('GET', '/circulo/resumen', { token: ct })).body.alertas, []); // el cuidador ya la vio
    assert.equal((await s.p('GET', '/alertas')).body.alertas[0].visto, false); // la persona aún la ve sin marcar

    const lista = (await s.p('GET', '/circulo')).body.cuidadores;
    assert.deepEqual(lista.map((c) => [c.nombre, c.parentesco]), [['Luis Ejemplo', 'Hijo']]);
    assert.equal((await s.p('DELETE', `/circulo/${lista[0].id}`)).status, 200);
    assert.equal((await s.call('GET', '/medicamentos', { token: ct })).status, 401);
  } finally { s.close(); }
});

test('los códigos vencen a las 24 horas', async () => {
  const s = await conPersona();
  try {
    const inv = (await s.p('POST', '/circulo/invitacion')).body;
    s.clock.set('2026-11-19T14:01:00Z');
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: inv.codigo, nombre: 'Luis' } })).status, 404);
  } finally { s.close(); }
});

test('adivinar códigos tiene límite: al noveno intento fallido, 429', async () => {
  const s = await conPersona();
  try {
    for (let i = 0; i < 8; i++) assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: `99999${i}`, nombre: 'X' } })).status, 404);
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: '999999', nombre: 'X' } })).status, 429);
    s.clock.set('2026-11-18T14:16:00Z'); // 16 minutos después se libera
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: '999999', nombre: 'X' } })).status, 404);
  } finally { s.close(); }
});

test('convocatorias: actualizar, filtrar por discapacidad, límite de una por minuto, cuidador solo lee', async () => {
  const s = await conPersona();
  try {
    assert.deepEqual((await s.p('GET', '/convocatorias')).body.items, []);
    const a = await s.p('POST', '/convocatorias/actualizar');
    assert.equal(a.status, 200);
    assert.deepEqual([a.body.ok, a.body.total], [true, 18]);
    assert.equal((await s.p('GET', '/convocatorias')).body.items.length, 18);
    const d = (await s.p('GET', '/convocatorias?discapacidad=1')).body;
    assert.equal(d.items.length, 3);
    assert.equal(d.fuente, 'https://ejemplo.test/convocatorias');
    assert.equal(d.ultimaLectura, '2026-11-18T08:00:00-06:00');
    assert.equal((await s.p('POST', '/convocatorias/actualizar')).status, 429);
    s.clock.set('2026-11-18T14:02:00Z');
    assert.equal((await s.p('POST', '/convocatorias/actualizar')).status, 200);
    const inv = (await s.p('POST', '/circulo/invitacion')).body.codigo;
    const ct = (await s.call('POST', '/circulo/unirse', { body: { codigo: inv, nombre: 'Luis' } })).body.token;
    assert.equal((await s.call('GET', '/convocatorias', { token: ct })).body.items.length, 18);
  } finally { s.close(); }
});

test('si la página falla, la lista anterior se conserva y se informa el error', async () => {
  const s = await conPersona();
  try {
    await s.p('POST', '/convocatorias/actualizar');
    s.clock.set('2026-11-18T14:05:00Z');
    s.app.store.data.convocatorias.error = null;
    const roto = await conPersona({ html: '<p>cambió</p>' });
    const r = await roto.p('POST', '/convocatorias/actualizar');
    assert.equal(r.body.ok, false);
    assert.match(r.body.error, /cambió de estructura/);
    assert.match((await roto.p('GET', '/convocatorias')).body.error, /cambió de estructura/);
    roto.close();
  } finally { s.close(); }
});

test('una convocatoria nueva genera una alerta informativa', async () => {
  const s = await conPersona();
  try {
    await s.p('POST', '/convocatorias/actualizar'); // primera lectura: sin alertas
    assert.equal((await s.p('GET', '/alertas')).body.alertas.filter((a) => a.tipo === 'convocatoria-nueva').length, 0);
    s.app.store.data.convocatorias.items.pop(); // simula que la última no estaba en la lectura anterior
    s.clock.set('2026-11-19T14:00:00Z');
    await s.p('POST', '/convocatorias/actualizar');
    const alertas = (await s.p('GET', '/alertas')).body.alertas.filter((a) => a.tipo === 'convocatoria-nueva');
    assert.equal(alertas.length, 1);
    assert.equal(alertas[0].severidad, 'info');
  } finally { s.close(); }
});

test('cuerpos inválidos: JSON roto 400, demasiado grande 413, arreglo en vez de objeto 400', async () => {
  const s = await conPersona();
  try {
    assert.equal((await s.call('POST', '/citas', { token: s.token, raw: '{no es json' })).status, 400);
    assert.equal((await s.call('POST', '/citas', { token: s.token, raw: '[1,2]' })).status, 400);
    const grande = JSON.stringify({ especialista: 'x'.repeat(70000) });
    assert.equal((await s.call('POST', '/citas', { token: s.token, raw: grande })).status, 413);
  } finally { s.close(); }
});

test('perfil: se puede editar y valida los rangos propios', async () => {
  const s = await conPersona();
  try {
    const r = await s.p('PATCH', '/perfil', { tolerancia: 45, preferencias: { altoContraste: true }, rangos: { glucosa: { max: 140 } } });
    assert.equal(r.body.perfil.tolerancia, 45);
    assert.deepEqual(r.body.perfil.preferencias, { textoGrande: true, altoContraste: true, voz: true });
    assert.equal(r.body.perfil.nombre, 'Ana Ejemplo');
    assert.equal((await s.p('PATCH', '/perfil', { tolerancia: 1 })).status, 400);
    assert.equal((await s.p('PATCH', '/perfil', { rangos: [1] })).status, 400);
    await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 150 } });
    assert.equal((await s.p('GET', '/mediciones')).body.mediciones[0].aviso.nivel, 'media'); // usa el rango del médico
  } finally { s.close(); }
});

test('/voz: confirmar, posponer, omitir y consultar con frases naturales', async () => {
  const s = await conPersona();
  try {
    const med = (await s.p('POST', '/medicamentos', { nombre: 'Losartán', dosis: '50 mg', horarios: ['08:00', '20:00'], existencias: 5 })).body.medicamento;
    assert.equal((await s.p('POST', '/voz', { texto: '' })).status, 400);
    assert.equal((await s.p('POST', '/voz', { texto: 'x'.repeat(301) })).status, 400);
    assert.match((await s.p('POST', '/voz', { texto: 'qué tengo hoy' })).body.reply, /Hoy tienes 2 tomas: ya tomaste 0 y faltan 2\. La siguiente es|Es la hora de Losartán/);
    assert.match((await s.p('POST', '/voz', { texto: '¿qué sigue?' })).body.reply, /Es la hora de Losartán, 50 mg, hoy a las 8 de la mañana/);

    const p = await s.p('POST', '/voz', { texto: 'pospón veinte minutos' });
    assert.equal(p.body.reply, 'Te lo recuerdo en 20 minutos.');
    assert.equal(p.body.accion.minutos, 20);
    assert.equal((await s.p('GET', '/tomas')).body.tomas[0].estado, 'pospuesta');

    const t = await s.p('POST', '/voz', { texto: 'Ya la tomé' });
    assert.equal(t.body.reply, 'Listo. Registré Losartán, 50 mg como tomada.');
    assert.equal(t.body.accion.hecho, true);
    assert.equal((await s.p('GET', '/tomas')).body.tomas[0].estado, 'tomada');
    assert.equal(s.app.store.data.medicamentos[0].existencias, 4); // la orden de voz también descuenta existencias

    const o = await s.p('POST', '/voz', { texto: 'no la tomaré' }); // ahora la del 20:00
    assert.equal(o.body.reply, 'De acuerdo. Marqué Losartán como omitida.');
    assert.equal((await s.p('GET', '/tomas')).body.tomas[1].estado, 'omitida');

    const nada = await s.p('POST', '/voz', { texto: 'ya la tomé' }); // no queda ninguna pendiente hoy
    assert.equal(nada.body.reply, 'No tienes ninguna toma pendiente.');
    assert.equal(nada.body.accion.hecho, false);
  } finally { s.close(); }
});

test('/voz: citas, convocatorias, ayuda y lo que no entiende; el cuidador no puede usarla', async () => {
  const s = await conPersona();
  try {
    assert.equal((await s.p('POST', '/voz', { texto: 'mis citas' })).body.reply, 'No tienes citas próximas.');
    await s.p('POST', '/citas', { especialista: 'Oftalmología', fecha: '2026-11-20', hora: '09:30', lugar: 'Hospital General' });
    assert.match((await s.p('POST', '/voz', { texto: 'mis citas' })).body.reply, /Tu próxima cita es con Oftalmología, el viernes 20 de noviembre a las 9:30 de la mañana, en Hospital General\./);
    assert.match((await s.p('POST', '/voz', { texto: 'convocatorias' })).body.reply, /Todavía no hay convocatorias guardadas/);
    await s.p('POST', '/convocatorias/actualizar');
    const c = (await s.p('POST', '/voz', { texto: 'convocatorias' })).body.reply;
    assert.match(c, /Hay 3 convocatorias para personas con discapacidad: Premio estatal por la discapacidad Manuel Trueva Martínez;/);
    assert.match((await s.p('POST', '/voz', { texto: 'ayuda' })).body.reply, /Puedes decir: ya la tomé/);
    assert.deepEqual((await s.p('POST', '/voz', { texto: 'qué bonito día' })).body.accion, { tipo: 'desconocido', hecho: false });
    const inv = (await s.p('POST', '/circulo/invitacion')).body.codigo;
    const ct = (await s.call('POST', '/circulo/unirse', { body: { codigo: inv, nombre: 'Luis' } })).body.token;
    assert.equal((await s.call('POST', '/voz', { token: ct, body: { texto: 'ya la tomé' } })).status, 403);
  } finally { s.close(); }
});

test('vincular otro dispositivo: código de 6 dígitos, un solo uso, y el nuevo dispositivo es la misma persona', async () => {
  const s = await conPersona();
  try {
    await s.p('POST', '/citas', { especialista: 'Oftalmología', fecha: '2026-11-25', hora: '10:00' });
    const inv = await s.p('POST', '/perfil/vincular');
    assert.equal(inv.status, 201);
    assert.match(inv.body.codigo, /^\d{6}$/);
    assert.equal((await s.call('POST', '/perfil/vincular/unirse', { body: { codigo: '000000' } })).status, 404);
    const u = await s.call('POST', '/perfil/vincular/unirse', { body: { codigo: inv.body.codigo, nombre: 'Computadora' } });
    assert.equal(u.status, 201);
    assert.equal(u.body.perfil.nombre, 'Ana Ejemplo');
    const t2 = u.body.token;
    assert.notEqual(t2, s.token);
    assert.equal((await s.call('POST', '/perfil/vincular/unirse', { body: { codigo: inv.body.codigo } })).status, 404); // un solo uso
    // el dispositivo nuevo puede leer Y escribir (es la persona, no un cuidador)
    assert.equal((await s.call('GET', '/citas', { token: t2 })).body.citas.length, 1);
    assert.equal((await s.call('POST', '/citas', { token: t2, body: { especialista: 'B', fecha: '2026-11-26', hora: '11:00' } })).status, 201);
  } finally { s.close(); }
});

test('los códigos de cuidador y de dispositivo no son intercambiables', async () => {
  const s = await conPersona();
  try {
    const cuidador = (await s.p('POST', '/circulo/invitacion')).body.codigo;
    const dispositivo = (await s.p('POST', '/perfil/vincular')).body.codigo;
    assert.equal((await s.call('POST', '/perfil/vincular/unirse', { body: { codigo: cuidador } })).status, 404);
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: dispositivo, nombre: 'Luis' } })).status, 404);
    assert.equal((await s.call('POST', '/circulo/unirse', { body: { codigo: cuidador, nombre: 'Luis' } })).status, 201);
    assert.equal((await s.call('POST', '/perfil/vincular/unirse', { body: { codigo: dispositivo } })).status, 201);
  } finally { s.close(); }
});

test('solo la persona genera códigos de dispositivo; el cuidador no', async () => {
  const s = await conPersona();
  try {
    const inv = (await s.p('POST', '/circulo/invitacion')).body.codigo;
    const ct = (await s.call('POST', '/circulo/unirse', { body: { codigo: inv, nombre: 'Luis' } })).body.token;
    assert.equal((await s.call('POST', '/perfil/vincular', { token: ct })).status, 403);
    assert.equal((await s.call('GET', '/dispositivos', { token: ct })).status, 403);
  } finally { s.close(); }
});

test('dispositivos: se listan y se puede quitar el acceso de uno perdido (nunca el propio)', async () => {
  const s = await conPersona();
  try {
    const cod = (await s.p('POST', '/perfil/vincular')).body.codigo;
    const t2 = (await s.call('POST', '/perfil/vincular/unirse', { body: { codigo: cod, nombre: 'Teléfono viejo' } })).body.token;
    const lista = (await s.p('GET', '/dispositivos')).body.dispositivos;
    assert.equal(lista.length, 2);
    assert.deepEqual(lista.map((d) => d.nombre).sort(), ['Ana Ejemplo', 'Teléfono viejo']);
    const propio = lista.find((d) => d.nombre === 'Ana Ejemplo');
    const viejo = lista.find((d) => d.nombre === 'Teléfono viejo');
    assert.equal((await s.p('DELETE', `/dispositivos/${propio.id}`)).status, 400); // no puede cerrarse la sesión a sí mismo por aquí
    assert.equal((await s.p('DELETE', `/dispositivos/${viejo.id}`)).status, 200);
    assert.equal((await s.call('GET', '/citas', { token: t2 })).status, 401); // el viejo ya no entra
    assert.equal((await s.p('DELETE', '/dispositivos/aaaaaaaaaa')).status, 404);
    assert.equal((await s.p('GET', '/dispositivos')).body.dispositivos.length, 1);
  } finally { s.close(); }
});
