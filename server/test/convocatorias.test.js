const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const C = require('../src/convocatorias');
const { Store } = require('../src/store');

const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'convocatorias.html'), 'utf8');
const now = { date: '2026-11-18', time: '12:00' };

test('parsear la página oficial: 18 convocatorias, las de discapacidad primero', () => {
  const items = C.parsear(html);
  assert.equal(items.length, 18);
  assert.deepEqual(items.slice(0, 3).map((i) => i.discapacidad), [true, true, true]);
  assert.ok(items.slice(3).every((i) => !i.discapacidad));
  assert.equal(items[0].nombre, 'Premio estatal por la discapacidad Manuel Trueva Martínez');
  assert.equal(items[0].documento, 'https://sdhybc.chihuahua.gob.mx/portal/convocatorias/dgvypd/2026_convocatoria-Manuel-Trueva.pdf');
  assert.equal(items[0].ficha, 'https://www.chihuahua.gob.mx/info/convocatoria-premio-estatal-por-la-discapacidad-manuel-trueva-martinez-2026');
  assert.equal(items[0].id, 'convocatoria-premio-estatal-por-la-discapacidad-manuel-trueva-martinez-2026');
});

test('parsear: dependencias en 3 secciones, https forzado y tipo de documento', () => {
  const items = C.parsear(html);
  const deps = [...new Set(items.map((i) => i.dependencia))];
  assert.equal(deps.length, 3);
  assert.ok(deps.includes('Dirección de Grupos Vulnerables y Prevención a la Discriminación'));
  assert.ok(items.every((i) => i.documento.startsWith('https://')));
  assert.ok(items.some((i) => i.tipoDocumento === 'imagen'));
  assert.ok(items.some((i) => i.tipoDocumento === 'pdf'));
  assert.equal(new Set(items.map((i) => i.id)).size, 18); // ids únicos
  assert.ok(items.every((i) => !/^convocatoria\b/i.test(i.nombre)));
});

test('parsear: HTML sin la estructura esperada devuelve lista vacía, sin romper', () => {
  assert.deepEqual(C.parsear('<html><body><p>nada</p></body></html>'), []);
  assert.deepEqual(C.parsear(''), []);
});

test('decodificar entidades y limpiar nombres', () => {
  assert.equal(C.decodificar('Ni&ntilde;os &amp; ni&#241;as &#x41;'), 'Niños & niñas A');
  assert.equal(C.limpiarNombre('Convocatoria de apoyos alimentarios'), 'Apoyos alimentarios');
  assert.equal(C.limpiarNombre('Convocatoria Kit Gerontológico'), 'Kit Gerontológico');
  assert.equal(C.capitalizar('DIRECCIÓN DE GRUPOS VULNERABLES Y PREVENCIÓN'), 'Dirección de Grupos Vulnerables y Prevención');
});

test('unir: la primera lectura no genera «nuevas»; las siguientes sí', () => {
  const vacio = { items: [], nuevas: [], baseline: false };
  const a = C.parsear(html);
  const primera = C.unir(vacio, a, now);
  assert.equal(primera.nuevas.length, 0);
  assert.equal(primera.baseline, true);
  const sin = C.unir(primera, a.slice(1), now); // una desaparece: no es «nueva»
  assert.equal(sin.nuevas.length, 0);
  const con = C.unir(sin, a, { date: '2026-11-19', time: '08:00' }); // reaparece: sí lo es
  assert.equal(con.nuevas.length, 1);
  assert.equal(con.nuevas[0].id, a[0].id);
  assert.equal(con.items.find((i) => i.id === a[1].id).vistaPrimeraVez, '2026-11-18'); // conserva cuándo la vio por primera vez
});

test('actualizar guarda la lista; si la lectura falla, conserva la anterior y dice por qué', async () => {
  const store = new Store(null);
  const ok = await C.actualizar(store, { fetchHtml: async () => html, now });
  assert.deepEqual(ok, { ok: true, total: 18, nuevas: 0 });
  assert.equal(store.data.convocatorias.items.length, 18);
  const mal = await C.actualizar(store, { fetchHtml: async () => { throw new Error('sin conexión'); }, now });
  assert.deepEqual(mal, { ok: false, error: 'sin conexión' });
  assert.equal(store.data.convocatorias.items.length, 18);
  assert.equal(store.data.convocatorias.error, 'sin conexión');
  const cambio = await C.actualizar(store, { fetchHtml: async () => '<p>otra cosa</p>', now });
  assert.equal(cambio.ok, false);
  assert.equal(store.data.convocatorias.items.length, 18);
});

test('descargar: sigue redirecciones, respeta el estado y el tope de tamaño', async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === '/redir') { res.writeHead(302, { Location: '/pagina' }); return res.end(); }
    if (req.url === '/pagina') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html); }
    if (req.url === '/grande') { res.writeHead(200); return res.end('x'.repeat(3 * 1024 * 1024)); }
    res.writeHead(500); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal(C.parsear(await C.descargar(`${base}/redir`)).length, 18);
    await assert.rejects(C.descargar(`${base}/mala`), /respondió 500/);
    await assert.rejects(C.descargar(`${base}/grande`), /demasiado grande|aborted|socket|destroyed/i);
  } finally {
    srv.closeAllConnections();
    srv.close();
  }
});
