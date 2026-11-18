// comandos.js — órdenes por voz o texto en español: «ya la tomé», «pospón diez minutos», «qué sigue»…
// Mismas reglas que la app Android (Comandos.kt), para que el teléfono y la computadora se entiendan igual.

const NUMEROS = { cinco: 5, diez: 10, quince: 15, veinte: 20, treinta: 30, 'cuarenta y cinco': 45, cuarenta: 40, 'media hora': 30, 'una hora': 60, hora: 60 };

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}+/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contiene = (t, ...frases) => frases.some((f) => new RegExp(`(^| )${escapar(f)}( |$)`).test(t));

function minutosDe(t) {
  const m = /(\d{1,3}) minutos?/.exec(t);
  if (m) return Math.min(180, Math.max(5, Number(m[1])));
  for (const [palabra, n] of Object.entries(NUMEROS).sort((a, b) => b[0].length - a[0].length)) if (t.includes(palabra)) return n;
  return 10;
}

/** → { tipo: 'tomada' | 'posponer' | 'omitir' | 'siguiente' | 'hoy' | 'citas' | 'convocatorias' | 'ayuda' | 'desconocido', minutos? } */
function interpretar(frase) {
  const t = normalizar(frase);
  if (!t) return { tipo: 'desconocido' };
  // «No la tomaré» debe ganarle a «tomé»
  if (contiene(t, 'omitir', 'omito', 'omite', 'saltar', 'salta', 'salto', 'no la tomare', 'no lo tomare', 'no la voy a tomar', 'no lo voy a tomar', 'no la tome', 'no lo tome')) return { tipo: 'omitir' };
  if (contiene(t, 'pospon', 'pospone', 'posponer', 'pospongo', 'mas tarde', 'despues', 'recuerdame en', 'recuerdamelo en')) return { tipo: 'posponer', minutos: minutosDe(t) };
  if (contiene(t, 'ya la tome', 'ya lo tome', 'ya tome', 'la tome', 'lo tome', 'tome', 'listo', 'tomada', 'tomado', 'confirmo', 'confirmar', 'hecho')) return { tipo: 'tomada' };
  if (contiene(t, 'que sigue', 'siguiente', 'proxima', 'proximo', 'que me toca', 'que toca', 'cual sigue')) return { tipo: 'siguiente' };
  if (contiene(t, 'citas', 'cita', 'consultas', 'consulta', 'agenda', 'doctor', 'medico')) return { tipo: 'citas' };
  if (contiene(t, 'convocatorias', 'convocatoria', 'apoyos', 'apoyo', 'premios', 'premio')) return { tipo: 'convocatorias' };
  if (contiene(t, 'hoy', 'mis medicinas', 'mis medicamentos', 'lista', 'resumen')) return { tipo: 'hoy' };
  if (contiene(t, 'ayuda', 'ayudame', 'que puedo decir', 'comandos', 'opciones')) return { tipo: 'ayuda' };
  return { tipo: 'desconocido' };
}

const AYUDA_VOZ = 'Puedes decir: ya la tomé. Pospón diez minutos. Omitir. Qué sigue. Qué tengo hoy. Mis citas. O convocatorias.';

module.exports = { interpretar, AYUDA_VOZ };
