// «Necesito ayuda»: la persona avisa a su círculo con un toque, por voz o conversando.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { arrancar, conPersona, texto, usa, modeloFalso } = require('./ayudante');
const { interpretar } = require('../src/comandos');

test('POST /ayuda: guarda la ayuda, responde 201 con cuántos cuidadores hay y valida el mensaje', async () => {
  const s = await conPersona();
  try {
    await s.cuidador('Luis Ejemplo');
    await s.cuidador('Rosa Ejemplo');
    const r = await s.p('POST', '/ayuda', { mensaje: '  Me caí en la cocina  ' });
    assert.equal(r.status, 201);
    assert.equal(r.body.cuidadores, 2);
    assert.match(r.body.ayuda.id, /^[0-9a-f]{10}$/);
    assert.deepEqual({ ...r.body.ayuda, id: 'x' }, { id: 'x', fecha: '2026-11-18', hora: '08:00', mensaje: 'Me caí en la cocina' });
    assert.equal(s.hogar().ayudas.length, 1);
    assert.equal((await s.p('POST', '/ayuda', { mensaje: 'x'.repeat(201) })).status, 400);
    assert.equal((await s.p('POST', '/ayuda', { mensaje: 42 })).status, 400);
  } finally { s.close(); }
});

test('POST /ayuda: sin cuerpo funciona; en el mismo minuto no se duplica (200 con la misma); después sí', async () => {
  const s = await conPersona();
  try {
    const a = await s.call('POST', '/ayuda', { token: s.token });
    assert.equal(a.status, 201);
    assert.equal(a.body.ayuda.mensaje, '');
    assert.equal(a.body.cuidadores, 0);
    s.clock.set('2026-11-18T14:00:40Z');
    const b = await s.p('POST', '/ayuda', { mensaje: 'otra vez' });
    assert.equal(b.status, 200);
    assert.equal(b.body.ayuda.id, a.body.ayuda.id);
    assert.equal(s.hogar().ayudas.length, 1);
    s.clock.set('2026-11-18T14:01:05Z');
    const c = await s.p('POST', '/ayuda', {});
    assert.equal(c.status, 201);
    assert.notEqual(c.body.ayuda.id, a.body.ayuda.id);
    assert.equal(s.hogar().ayudas.length, 2);
  } finally { s.close(); }
});

test('POST /ayuda: solo la persona; el cuidador recibe 403 y sin token 401', async () => {
  const s = await conPersona();
  try {
    const ct = await s.cuidador();
    assert.equal((await s.call('POST', '/ayuda', { token: ct, body: {} })).status, 403);
    assert.equal((await s.call('POST', '/ayuda', { body: {} })).status, 401);
  } finally { s.close(); }
});

test('alertas: cada ayuda de las últimas 24 h aparece primero, alta, y se puede marcar vista', async () => {
  const s = await conPersona();
  try {
    const ct = await s.cuidador();
    const ayuda = (await s.p('POST', '/ayuda', {})).body.ayuda;
    s.clock.set('2026-11-18T14:30:00Z'); // 08:30: una glucosa muy baja (también alta y MÁS reciente) no le gana a la ayuda
    await s.p('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 45 } });
    const al = (await s.call('GET', '/alertas', { token: ct })).body.alertas;
    assert.deepEqual(al[0], { id: `ayuda:${ayuda.id}`, tipo: 'ayuda', severidad: 'alta', titulo: 'Ana Ejemplo pidió ayuda', detalle: 'Sin mensaje', fecha: '2026-11-18T08:00:00-06:00', visto: false });
    assert.equal(al[1].tipo, 'medicion-fuera-de-rango');
    const res = (await s.call('GET', '/circulo/resumen', { token: ct })).body;
    assert.equal(res.alertas[0].tipo, 'ayuda');
    assert.equal((await s.call('POST', `/alertas/${encodeURIComponent(`ayuda:${ayuda.id}`)}/visto`, { token: ct })).status, 200);
    assert.ok(!(await s.call('GET', '/circulo/resumen', { token: ct })).body.alertas.some((a) => a.tipo === 'ayuda'));
    // pasadas 24 horas ya no aparece
    s.clock.set('2026-11-19T15:01:00Z');
    assert.ok(!(await s.p('GET', '/alertas')).body.alertas.some((a) => a.tipo === 'ayuda'));
  } finally { s.close(); }
});

test('alertas: la ayuda más reciente va antes y el detalle es el mensaje', async () => {
  const s = await conPersona();
  try {
    await s.p('POST', '/ayuda', { mensaje: 'primera' });
    s.clock.set('2026-11-18T14:05:00Z');
    await s.p('POST', '/ayuda', { mensaje: 'segunda' });
    const al = (await s.p('GET', '/alertas')).body.alertas.filter((a) => a.tipo === 'ayuda');
    assert.deepEqual(al.map((a) => a.detalle), ['segunda', 'primera']);
  } finally { s.close(); }
});

test('las ayudas guardadas tienen tope (las 100 más recientes)', async () => {
  const s = await conPersona();
  try {
    for (let i = 0; i < 105; i++) {
      s.clock.set(new Date(Date.parse('2026-11-18T14:00:00Z') + i * 61000).toISOString());
      await s.p('POST', '/ayuda', {});
    }
    assert.equal(s.hogar().ayudas.length, 100);
  } finally { s.close(); }
});

test('un hogar guardado antes de existir «ayudas» funciona sin perder nada', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lazo-')), 'datos.json');
  const hash = crypto.createHash('sha256').update('lzo_viejo').digest('hex');
  fs.writeFileSync(f, JSON.stringify({
    version: 2,
    hogares: { h1: { perfil: { nombre: 'Ana Ejemplo', discapacidad: 'visual', tolerancia: 30 }, tokens: [{ id: 'aaaaaaaaaa', hash, rol: 'persona', nombre: 'Ana', creado: '2026-11-01' }], invitaciones: [], medicamentos: [], tomas: [], citas: [] } },
    convocatorias: { items: [], nuevas: [], ultimaLectura: null, error: null, baseline: false }
  }));
  const s = await arrancar({ dataFile: f });
  try {
    assert.equal((await s.call('GET', '/alertas', { token: 'lzo_viejo' })).status, 200);
    assert.equal((await s.call('GET', '/mediciones', { token: 'lzo_viejo' })).status, 200); // le faltaba «mediciones»
    assert.equal((await s.call('POST', '/ayuda', { token: 'lzo_viejo', body: {} })).status, 201);
    assert.equal((await s.call('POST', '/alertas/x/visto', { token: 'lzo_viejo' })).status, 200); // le faltaba «vistos»
  } finally { s.close(); }
});

test('intérprete: «necesito ayuda», «auxilio», «emergencia», «ayúdenme» piden ayuda; «ayuda» sola es la lista', () => {
  for (const f of ['necesito ayuda', 'Auxilio', '¡Emergencia!', 'ayúdenme', 'auxilio me caí', 'necesito ayuda urgente']) assert.equal(interpretar(f).tipo, 'pedir-ayuda', f);
  for (const f of ['ayuda', 'Ayuda', 'qué puedo decir']) assert.equal(interpretar(f).tipo, 'ayuda', f);
});

test('/voz: «necesito ayuda» registra la ayuda y lo dice; sin modelo y sin gastarlo', async () => {
  const llm = modeloFalso();
  const s = await conPersona({ llm });
  try {
    await s.cuidador();
    const r = await s.p('POST', '/voz', { texto: 'necesito ayuda' });
    assert.equal(r.body.reply, 'Avisé a tus cuidadores. Si es una emergencia, llama al 911.');
    assert.deepEqual(r.body.accion, { tipo: 'pedir-ayuda', hecho: true });
    assert.equal(s.hogar().ayudas.length, 1);
    assert.equal(s.hogar().ayudas[0].mensaje, 'necesito ayuda');
    assert.equal(llm.recibidos.length, 0);
  } finally { s.close(); }
});

test('/voz: si no hay cuidadores, no dice que avisó a nadie (pero guarda la ayuda)', async () => {
  const s = await conPersona();
  try {
    const r = await s.p('POST', '/voz', { texto: 'auxilio' });
    assert.equal(r.body.reply, 'Todavía no tienes cuidadores en tu círculo. Si es una emergencia, llama al 911.');
    assert.equal(s.hogar().ayudas.length, 1);
  } finally { s.close(); }
});

test('conversación: herramienta pedir_ayuda con la misma lógica, y el sistema la pide junto con el 911', async () => {
  const llm = modeloFalso(usa('pedir_ayuda', { mensaje: 'Se cayó en el baño' }), texto('Ya avisé a tu círculo. Si es una emergencia, llama al 911.'));
  const s = await conPersona({ llm });
  try {
    await s.cuidador();
    const r = await s.p('POST', '/voz', { texto: 'me resbalé en el baño y no me puedo levantar bien' });
    assert.deepEqual(r.body.accion, { tipo: 'conversacion', hecho: true });
    assert.equal(s.hogar().ayudas[0].mensaje, 'Se cayó en el baño');
    const p = llm.recibidos[0];
    assert.ok(p.tools.some((t) => t.name === 'pedir_ayuda'));
    assert.match(p.system, /pedir_ayuda/);
    assert.match(p.system, /911/);
    assert.match(llm.recibidos[1].messages.at(-1).content[0].content, /"cuidadores":1/);
  } finally { s.close(); }
});
