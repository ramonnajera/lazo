// ayudante.js — servidor de prueba compartido por las pruebas nuevas (reloj movible, sin internet).
const http = require('http');
const { createApp } = require('../src/app');

/** Servidor de prueba. `clock.set('2026-11-18T14:00:00Z')` (UTC; local = UTC-6). */
async function arrancar({ dataFile = null, llm = null } = {}) {
  const clock = { t: new Date('2026-11-18T14:00:00Z') }; // 08:00 en Chihuahua
  clock.set = (iso) => { clock.t = new Date(iso); };
  const app = createApp({ dataFile, now: () => new Date(clock.t), fetchHtml: async () => '', convUrl: 'https://ejemplo.test/convocatorias', llm });
  const srv = http.createServer(app.handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, { token, body } = {}) => {
    const res = await fetch(base + p, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { app, clock, call, close: () => { srv.closeAllConnections(); srv.close(); } };
}

/** Servidor con una persona (Ana Ejemplo) y, si se pide, un cuidador. */
async function conPersona(opts = {}) {
  const s = await arrancar(opts);
  const r = await s.call('POST', '/perfil', { body: { nombre: 'Ana Ejemplo', discapacidad: 'visual' } });
  s.token = r.body.token;
  s.hogar = () => Object.values(s.app.store.data.hogares)[0];
  s.p = (m, p, body) => s.call(m, p, { token: s.token, body });
  s.cuidador = async (nombre = 'Luis Ejemplo') => {
    const codigo = (await s.p('POST', '/circulo/invitacion')).body.codigo;
    return (await s.call('POST', '/circulo/unirse', { body: { codigo, nombre } })).body.token;
  };
  return s;
}

const texto = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const usa = (nombre, input, id = 'tu1') => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name: nombre, input }] });

/** Modelo guionizado: devuelve las respuestas en orden y guarda lo que recibió. */
function modeloFalso(...respuestas) {
  const recibidos = [];
  const llm = async (payload) => {
    recibidos.push(JSON.parse(JSON.stringify(payload)));
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  llm.recibidos = recibidos;
  return llm;
}

module.exports = { arrancar, conPersona, texto, usa, modeloFalso };
