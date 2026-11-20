// _semilla.js — crea a Mateo (la demo de server/scripts/demo-autismo.js) en un servidor en memoria y devuelve su hogar,
// ya con el token público de la demo. Se llama cuando un visitante llega sin datos o pide reiniciar.
const { Readable } = require('stream');
const { createApp } = require('./_lazo/app');
const { hashToken } = require('./_lazo/store');
const { cargarMateo } = require('./_lazo/demo-autismo');

const TOKEN = 'demo-web-lazo-mateo'; // público a propósito: solo abre la copia de Mateo que vive en tu navegador

function llamar(app, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const crudo = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const req = Readable.from(crudo.length ? [crudo] : []);
    Object.assign(req, { method, url: path, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    let status = 200;
    const res = { writeHead: (s) => (status = s), end: (d) => (status >= 400 ? reject(new Error(`${method} ${path} → ${status} ${d}`)) : resolve(d ? JSON.parse(String(d)) : null)) };
    app.handler(req, res).catch(reject);
  });
}

async function sembrar() {
  const app = createApp({ dataFile: null, llm: null });
  const { token } = await llamar(app, 'POST', '/perfil', { nombre: 'Mateo Ruiz', discapacidad: 'otra' });
  await cargarMateo((method, path, body, tk = token) => llamar(app, method, path, body, tk));
  const h = Object.values(app.store.data.hogares)[0];
  const persona = h.tokens.find((t) => t.rol === 'persona');
  persona.hash = hashToken(TOKEN);
  persona.nombre = 'Demo web';
  h.invitaciones = [];
  return h;
}

module.exports = { sembrar, TOKEN };
