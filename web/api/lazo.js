// api/lazo.js — la demo web de Lazo corre el MISMO servidor (server/src, copiado en api/_lazo) dentro de una función de Vercel.
// No hay base de datos: cada visitante guarda su copia de los datos de Mateo en su navegador y la manda en cada petición.
// La función arma un servidor en memoria con esos datos, atiende la petición y devuelve la respuesta junto con los datos nuevos.
//
// Cuerpo: { estado?, chat?, peticion: { method, path, body?, audio? (base64), mime? } }
// Respuesta: { status, json, estado, chat }

const { Readable } = require('stream');
const { createApp } = require('./_lazo/app');
const { hashToken } = require('./_lazo/store');
const { sembrar, TOKEN } = require('./_semilla');
const CONVOCATORIAS = require('./_convocatorias.json');

const MAX_ESTADO = 400 * 1024;
const MAX_AUDIO_B64 = 3 * 1024 * 1024; // ~2 MB de audio: una nota de voz de un minuto pesa mucho menos
const RUTAS = /^\/(tomas|proxima|citas|mediciones|alertas|resurtir|convocatorias|perfil|medicamentos|voz|voz\/audio|ayuda|circulo\/resumen|circulo|alertas\/[^/]+\/visto|medicamentos\/[0-9a-f]{10}|citas\/[0-9a-f]{10}|mediciones\/[0-9a-f]{10})(\?.*)?$/;

// Topes para cuidar el gasto del modelo (por instancia de la función; si se pasan, Lazo contesta con el intérprete de frases).
const POR_IP_HORA = 40;
const GLOBAL_DIA = 1500;
const usoIp = new Map();
let usoDia = { fecha: '', n: 0 };

function cupoModelo(ip) {
  const t = Date.now();
  const hoy = new Date().toISOString().slice(0, 10);
  if (usoDia.fecha !== hoy) usoDia = { fecha: hoy, n: 0 };
  const marcas = (usoIp.get(ip) || []).filter((x) => t - x < 3600000);
  if (marcas.length >= POR_IP_HORA || usoDia.n >= GLOBAL_DIA) return false;
  marcas.push(t);
  usoIp.set(ip, marcas);
  usoDia.n++;
  if (usoIp.size > 5000) usoIp.clear();
  return true;
}

/** Historial corto que manda el navegador: solo pares usuario/asistente de texto, recortados. */
function limpiarChat(chat) {
  if (!Array.isArray(chat)) return [];
  const ok = chat
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 600) }))
    .slice(-10);
  while (ok.length && ok[0].role !== 'user') ok.shift();
  return ok;
}

function memoriaDe(inicial) {
  let mensajes = inicial;
  return {
    leer: () => mensajes,
    guardar(_id, usuario, asistente) {
      mensajes = [...mensajes, { role: 'user', content: usuario }, { role: 'assistant', content: asistente }].slice(-10);
      while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift();
    },
    todo: () => mensajes,
  };
}

/** Llama al handler del servidor real con una petición y una respuesta en memoria. */
function llamar(app, { method, path, body, audio, mime }) {
  return new Promise((resolve, reject) => {
    const crudo = audio ? Buffer.from(audio, 'base64') : body === undefined || body === null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    const req = Readable.from(crudo.length ? [crudo] : []);
    req.method = method;
    req.url = path;
    req.headers = { authorization: `Bearer ${TOKEN}`, 'content-type': audio ? mime : 'application/json', 'content-length': String(crudo.length) };
    let status = 200;
    const res = {
      writeHead(s) {
        status = s;
      },
      end(data) {
        try {
          resolve({ status, json: data ? JSON.parse(String(data)) : null });
        } catch (e) {
          reject(e);
        }
      },
    };
    app.handler(req, res).catch(reject);
  });
}

function estadoValido(e) {
  return e && typeof e === 'object' && e.perfil && Array.isArray(e.tokens) && Array.isArray(e.medicamentos) && Array.isArray(e.tomas) && Array.isArray(e.citas) && Array.isArray(e.mediciones) && e.tokens.some((t) => t.hash === hashToken(TOKEN));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'usa POST' });
  try {
    const b = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const p = b.peticion || {};
    const method = String(p.method || 'GET').toUpperCase();
    const path = String(p.path || '');
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method) || !RUTAS.test(path)) return res.status(400).json({ error: 'ruta no disponible en la demo' });
    if (p.audio && (typeof p.audio !== 'string' || p.audio.length > MAX_AUDIO_B64)) return res.status(413).json({ error: 'el audio es demasiado largo' });

    // Datos del visitante; si no trae (o vienen de otro día o rotos), se siembra a Mateo de nuevo.
    let estado = b.estado;
    if (estado && JSON.stringify(estado).length > MAX_ESTADO) estado = null;
    if (!estadoValido(estado)) estado = await sembrar();

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sin-ip';
    const usaModelo = (path === '/voz' || path === '/voz/audio') && method === 'POST';
    const memoria = memoriaDe(limpiarChat(b.chat));
    const app = createApp({
      dataFile: null,
      maxHogares: 1,
      memoria,
      ...(usaModelo && !cupoModelo(ip) ? { llm: null } : {}),
    });
    app.store.data = { version: 2, hogares: { demo: estado }, convocatorias: CONVOCATORIAS };

    const r = await llamar(app, { method, path, body: p.body, audio: p.audio, mime: String(p.mime || 'audio/webm').split(';')[0] });
    return res.status(200).json({ ...r, estado: app.store.data.hogares.demo, chat: memoria.todo() });
  } catch (e) {
    console.error('[lazo-demo]', e);
    return res.status(500).json({ error: 'error interno de la demo' });
  }
};
