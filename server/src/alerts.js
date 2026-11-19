// alerts.js — lo que el cuidador (y la persona) deben ver con atención. Se calcula al vuelo a partir de los datos:
// no se guarda nada salvo qué alertas ya vio cada quien (`vistos`).

const T = require('./time');
const S = require('./schedule');
const M = require('./mediciones');
const Rs = require('./resurtir');

const SEV = { alta: 0, media: 1, info: 2 };
const EXISTENCIAS_BAJAS = 3; // dosis

function dosisAlertas(data, now, tolerancia) {
  const out = [];
  for (let back = 0; back <= 2; back++) {
    const date = T.addDays(now.date, -back);
    for (const d of S.dayView(data, date, now, tolerancia)) {
      if (d.estado === 'atrasada') {
        out.push({ id: `dosis:${d.medicamentoId}:${d.fecha}:${d.hora}`, tipo: 'dosis-atrasada', severidad: 'alta', fecha: T.iso(d.fecha, d.hora), titulo: `Sin confirmar: ${d.nombre}`, detalle: `La toma de las ${d.hora} no se ha confirmado.` });
      } else if (d.estado === 'omitida') {
        out.push({ id: `dosis:${d.medicamentoId}:${d.fecha}:${d.hora}`, tipo: 'dosis-omitida', severidad: 'media', fecha: T.iso(d.fecha, d.hora), titulo: `Omitió: ${d.nombre}`, detalle: `Marcó como omitida la toma de las ${d.hora}.` });
      }
    }
  }
  return out;
}

function citaAlertas(data, now) {
  const out = [];
  const nowAbs = T.absMin(now.date, now.time);
  for (const c of data.citas) {
    const delta = T.absMin(c.fecha, c.hora) - nowAbs;
    if (delta >= 0 && delta <= 24 * 60) {
      out.push({ id: `cita:${c.id}`, tipo: 'cita-proxima', severidad: 'info', fecha: T.iso(c.fecha, c.hora), titulo: `Cita: ${c.especialista || c.motivo || 'consulta'}`, detalle: `${c.fecha === now.date ? 'Hoy' : 'Mañana'} a las ${c.hora}${c.lugar ? ` en ${c.lugar}` : ''}.` });
    }
  }
  return out;
}

function medicionAlertas(data, now, rangos) {
  const out = [];
  const limite = T.absMin(now.date, now.time) - 24 * 60;
  for (const m of data.mediciones) {
    if (T.absMin(m.fecha, m.hora) < limite) continue;
    const ev = M.evaluar(m.tipo, m.valor, rangos);
    if (ev) out.push({ id: `medicion:${m.id}`, tipo: 'medicion-fuera-de-rango', severidad: ev.nivel, fecha: T.iso(m.fecha, m.hora), titulo: ev.texto, detalle: 'Aviso orientativo, no es un diagnóstico. Consulta a su médico si persiste.' });
  }
  return out;
}

/** Quedan 3 dosis o menos, o alcanzan para 3 días o menos. No avisa de un tratamiento que ya terminó o que alcanza hasta su fin. */
function existenciasAlertas(data, now, tolerancia) {
  const out = [];
  for (const r of Rs.estimar(data, now, tolerancia)) {
    if (r.alcanzaHastaFin) continue;
    if (r.existencias > EXISTENCIAS_BAJAS && !r.urgente) continue;
    const quedan = r.existencias === 1 ? 'Queda 1' : `Quedan ${r.existencias}`;
    const detalle = r.existencias <= 0 ? 'Ya no quedan.'
      : r.diasRestantes === null ? `${quedan}.`
      : r.diasRestantes === 0 ? `${quedan}: se acaban hoy.`
      : `${quedan}: alcanzan para ${r.diasRestantes === 1 ? '1 día' : `${r.diasRestantes} días`}.`;
    out.push({ id: `existencias:${r.id}:${r.existencias}`, tipo: 'existencias-bajas', severidad: 'media', fecha: T.iso(now.date, now.time), titulo: `Quedan pocas dosis de ${r.nombre}`, detalle });
  }
  return out;
}

/** «Necesito ayuda» de las últimas 24 horas: siempre van antes que todo lo demás. */
function ayudaAlertas(data, now) {
  const limite = T.absMin(now.date, now.time) - 24 * 60;
  const nombre = (data.perfil && data.perfil.nombre) || 'La persona';
  return (data.ayudas || [])
    .filter((a) => T.absMin(a.fecha, a.hora) >= limite)
    .map((a) => ({ id: `ayuda:${a.id}`, tipo: 'ayuda', severidad: 'alta', titulo: `${nombre} pidió ayuda`, detalle: a.mensaje || 'Sin mensaje', fecha: T.iso(a.fecha, a.hora), ms: a.ms || 0 }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.ms - a.ms)
    .map(({ ms, ...a }) => a);
}

function convocatoriaAlertas(data, now) {
  const hace7 = T.absMin(now.date, now.time) - 7 * 24 * 60;
  return (data.convocatorias.nuevas || [])
    .filter((n) => n.detectada >= hace7)
    .map((n) => ({ id: `convocatoria:${n.id}`, tipo: 'convocatoria-nueva', severidad: 'info', fecha: T.iso(...Object.values(T.fromAbsMin(n.detectada))), titulo: `Nueva convocatoria: ${n.nombre}`, detalle: n.discapacidad ? 'Es para personas con discapacidad.' : 'Publicada por la Secretaría.' }));
}

/** Todas las alertas vigentes, más graves primero y luego las más recientes. `tokenId` marca las ya vistas. */
function compute(data, now, tokenId) {
  const tolerancia = (data.perfil && data.perfil.tolerancia) || S.TOLERANCIA_MIN;
  const rangos = (data.perfil && data.perfil.rangos) || {};
  const resto = [...dosisAlertas(data, now, tolerancia), ...citaAlertas(data, now), ...medicionAlertas(data, now, rangos), ...existenciasAlertas(data, now, tolerancia), ...convocatoriaAlertas(data, now)]
    .sort((a, b) => SEV[a.severidad] - SEV[b.severidad] || b.fecha.localeCompare(a.fecha));
  const vistos = new Set((data.vistos && data.vistos[tokenId]) || []);
  return [...ayudaAlertas(data, now), ...resto].map((a) => ({ ...a, visto: vistos.has(a.id) }));
}

module.exports = { compute, EXISTENCIAS_BAJAS };
