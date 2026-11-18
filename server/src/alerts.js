// alerts.js — lo que el cuidador (y la persona) deben ver con atención. Se calcula al vuelo a partir de los datos:
// no se guarda nada salvo qué alertas ya vio cada quien (`vistos`).

const T = require('./time');
const S = require('./schedule');
const M = require('./mediciones');

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

function existenciasAlertas(data, now) {
  const out = [];
  for (const m of data.medicamentos) {
    if (m.activo === false || typeof m.existencias !== 'number') continue;
    if (m.existencias <= EXISTENCIAS_BAJAS) {
      out.push({ id: `existencias:${m.id}:${m.existencias}`, tipo: 'existencias-bajas', severidad: 'media', fecha: T.iso(now.date, now.time), titulo: `Quedan pocas dosis de ${m.nombre}`, detalle: m.existencias <= 0 ? 'Ya no quedan.' : `Quedan ${m.existencias}.` });
    }
  }
  return out;
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
  const todas = [...dosisAlertas(data, now, tolerancia), ...citaAlertas(data, now), ...medicionAlertas(data, now, rangos), ...existenciasAlertas(data, now), ...convocatoriaAlertas(data, now)];
  const vistos = new Set((data.vistos && data.vistos[tokenId]) || []);
  return todas
    .map((a) => ({ ...a, visto: vistos.has(a.id) }))
    .sort((a, b) => SEV[a.severidad] - SEV[b.severidad] || b.fecha.localeCompare(a.fecha));
}

module.exports = { compute, EXISTENCIAS_BAJAS };
