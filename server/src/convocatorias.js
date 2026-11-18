// convocatorias.js — lee la página pública de convocatorias de la Secretaría de Desarrollo Humano y Bien Común de
// Chihuahua y la convierte en una lista. La página NO publica fechas ni estado (abierta/cerrada), así que Lazo no
// inventa ninguno: muestra el nombre, la dependencia y los enlaces oficiales.

const https = require('https');
const http = require('http');
const T = require('./time');

const PAGE_URL = 'https://www.chihuahua.gob.mx/info/convocatorias-y-resultados-2026';
const MAX_BYTES = 2 * 1024 * 1024;
const NOMBRES_CORTOS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'en', 'para', 'por', 'con']);

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü' };

function decodificar(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m);
}

const texto = (html) => decodificar(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** «DIRECCIÓN DE GRUPOS VULNERABLES» → «Dirección de Grupos Vulnerables». */
function capitalizar(s) {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && NOMBRES_CORTOS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** «Convocatoria de apoyos alimentarios…» → «Apoyos alimentarios…». */
function limpiarNombre(s) {
  const n = s.replace(/^convocatoria\s+(de\s+|para\s+)?/i, '').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Los sitios de gobierno aceptan https; algunos enlaces de la página vienen en http. */
function normalizarUrl(u) {
  try {
    const url = new URL(u, PAGE_URL);
    if (url.protocol === 'http:' && /(^|\.)chihuahua\.gob\.mx$/.test(url.hostname)) url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

function tipoDocumento(u) {
  if (/\.pdf($|\?)/i.test(u)) return 'pdf';
  if (/\.(png|jpe?g|webp)($|\?)/i.test(u)) return 'imagen';
  return 'web';
}

function idDe(ficha, doc) {
  const src = ficha || doc;
  const ultimo = new URL(src).pathname.split('/').filter(Boolean).pop() || src;
  return ultimo.replace(/\.[a-z]+$/i, '').toLowerCase();
}

/** Extrae las convocatorias del HTML de la página. Devuelve [] si la estructura cambió. */
function parsear(html) {
  const ini = html.search(/field--name-body/);
  const fin = html.indexOf('</article>', Math.max(ini, 0));
  const region = ini >= 0 ? html.slice(ini, fin > 0 ? fin : undefined) : html;
  const re = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const items = [];
  let dependencia = '';
  let m;
  while ((m = re.exec(region))) {
    if (m[1]) {
      const t = texto(m[2]);
      if (t) dependencia = capitalizar(t);
      continue;
    }
    const anchors = [...m[3].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((a) => ({ url: normalizarUrl(decodificar(a[1])), texto: texto(a[2]) }));
    const doc = anchors.find((a) => a.url && a.texto && !/^ver m[aá]s/i.test(a.texto));
    if (!doc) continue;
    const ficha = anchors.find((a) => a.url && /^ver m[aá]s/i.test(a.texto));
    const nombre = limpiarNombre(doc.texto);
    items.push({
      id: idDe(ficha && ficha.url, doc.url),
      nombre,
      dependencia,
      documento: doc.url,
      ficha: ficha ? ficha.url : null,
      tipoDocumento: tipoDocumento(doc.url),
      discapacidad: /discapacidad/i.test(nombre)
    });
  }
  // Sin repetidos (la página a veces repite un enlace) y las de discapacidad primero, conservando el orden de la página.
  const vistos = new Set();
  return items
    .filter((i) => (vistos.has(i.id) ? false : vistos.add(i.id)))
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => Number(b.it.discapacidad) - Number(a.it.discapacidad) || a.idx - b.idx)
    .map((x) => x.it);
}

/** Une la lectura nueva con la anterior; detecta las convocatorias que no estaban (salvo en la primera lectura). */
function unir(prev, encontradas, now) {
  const nowAbs = T.absMin(now.date, now.time);
  const anteriores = new Map(prev.items.map((i) => [i.id, i]));
  const nuevas = prev.baseline ? encontradas.filter((f) => !anteriores.has(f.id)).map((f) => ({ id: f.id, nombre: f.nombre, discapacidad: f.discapacidad, detectada: nowAbs })) : [];
  const limite = nowAbs - 30 * 24 * 60;
  return {
    items: encontradas.map((f) => ({ ...f, vistaPrimeraVez: (anteriores.get(f.id) || {}).vistaPrimeraVez || now.date })),
    nuevas: [...(prev.nuevas || []).filter((n) => n.detectada >= limite), ...nuevas],
    ultimaLectura: `${now.date}T${now.time}:00-06:00`,
    error: null,
    baseline: true
  };
}

/** Descarga con redirecciones, tope de tamaño y tiempo máximo. */
function descargar(url, { timeoutMs = 20000, redirecciones = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Lazo/1.0 (+convocatorias)', Accept: 'text/html' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirecciones <= 0) return reject(new Error('demasiadas redirecciones'));
        return resolve(descargar(new URL(res.headers.location, url).toString(), { timeoutMs, redirecciones: redirecciones - 1 }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`la página respondió ${res.statusCode}`));
      }
      const partes = [];
      let total = 0;
      res.on('data', (c) => {
        total += c.length;
        if (total > MAX_BYTES) {
          req.destroy(new Error('la página es demasiado grande'));
          return;
        }
        partes.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('la página tardó demasiado')));
    req.on('error', reject);
  });
}

/**
 * Lee la página y actualiza `store.data.convocatorias`. Si falla o la estructura cambió, conserva la lista anterior
 * y deja el motivo en `error`: nunca se pierde lo que ya se tenía.
 */
async function actualizar(store, { fetchHtml = descargar, url = PAGE_URL, now = T.local() } = {}) {
  try {
    const encontradas = parsear(await fetchHtml(url));
    if (!encontradas.length) throw new Error('no encontré convocatorias: la página cambió de estructura');
    store.mutate((d) => {
      d.convocatorias = unir(d.convocatorias, encontradas, now);
    });
    return { ok: true, total: encontradas.length, nuevas: store.data.convocatorias.nuevas.length };
  } catch (e) {
    store.mutate((d) => {
      d.convocatorias = { ...d.convocatorias, error: e.message, intento: `${now.date}T${now.time}:00-06:00` };
    });
    return { ok: false, error: e.message };
  }
}

module.exports = { PAGE_URL, parsear, unir, actualizar, descargar, decodificar, limpiarNombre, capitalizar };
