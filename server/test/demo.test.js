const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const puertoLibre = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test('la demostración siembra datos ficticios y deja una toma que toca ahora', async () => {
  const port = await puertoLibre();
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'demo.js')], { env: { ...process.env, LAZO_PORT: String(port) } });
  let salida = '';
  p.stdout.on('data', (d) => (salida += d));
  try {
    const limite = Date.now() + 15000;
    while (!/Ctrl\+C/.test(salida) && Date.now() < limite) await new Promise((r) => setTimeout(r, 150));
    assert.match(salida, /Persona:\s+Ana Ejemplo/);
    const token = /Token:\s+(lzo_[0-9a-f]+)/.exec(salida)[1];
    assert.match(salida, /Código de cuidador[^:]*:\s+\d{6}/);
    const g = (ruta) => fetch(`http://127.0.0.1:${port}${ruta}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    const tomas = (await g('/tomas')).tomas;
    assert.ok(tomas.some((t) => t.estado === 'ahora' && t.nombre === 'Metformina'), JSON.stringify(tomas.map((t) => [t.nombre, t.hora, t.estado])));
    assert.equal((await g('/citas')).citas.length, 2);
    const med = (await g('/mediciones')).mediciones;
    assert.ok(med.some((m) => m.aviso && m.aviso.nivel === 'media')); // la glucosa de 245 muestra el aviso
    assert.ok((await g('/alertas')).alertas.some((a) => a.tipo === 'existencias-bajas')); // quedan 2 dosis de Losartán
  } finally { p.kill(); }
});
