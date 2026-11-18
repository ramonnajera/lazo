// resumen.js — lo que ve el cuidador: adherencia de la semana, próxima toma, próximas citas y últimas mediciones.

const T = require('./time');
const S = require('./schedule');
const M = require('./mediciones');
const A = require('./alerts');

function adherencia(data, now, dias = 7, tolerancia = S.TOLERANCIA_MIN) {
  const porDia = [];
  let vencidas = 0;
  let tomadas = 0;
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = T.addDays(now.date, -i);
    const v = S.dayView(data, fecha, now, tolerancia);
    const c = { fecha, programadas: v.length, tomadas: 0, omitidas: 0, atrasadas: 0, pendientes: 0 };
    for (const d of v) {
      if (d.estado === 'tomada') c.tomadas++;
      else if (d.estado === 'omitida') c.omitidas++;
      else if (d.estado === 'atrasada') c.atrasadas++;
      else c.pendientes++;
    }
    vencidas += c.tomadas + c.omitidas + c.atrasadas;
    tomadas += c.tomadas;
    porDia.push(c);
  }
  return { dias, porDia, porcentaje: vencidas ? Math.round((tomadas / vencidas) * 100) : null };
}

function ultimasMediciones(data) {
  const out = {};
  for (const m of [...data.mediciones].sort((a, b) => T.absMin(a.fecha, a.hora) - T.absMin(b.fecha, b.hora))) {
    out[m.tipo] = { fecha: m.fecha, hora: m.hora, valor: m.valor, texto: M.describir(m.tipo, m.valor) };
  }
  return out;
}

function proximasCitas(data, now, max = 3) {
  const nowAbs = T.absMin(now.date, now.time);
  return data.citas
    .filter((c) => T.absMin(c.fecha, c.hora) >= nowAbs)
    .sort((a, b) => T.absMin(a.fecha, a.hora) - T.absMin(b.fecha, b.hora))
    .slice(0, max);
}

function resumen(data, now, tokenId) {
  const tolerancia = (data.perfil && data.perfil.tolerancia) || S.TOLERANCIA_MIN;
  const p = data.perfil || {};
  return {
    persona: { nombre: p.nombre || '', discapacidad: p.discapacidad || null },
    ahora: { fecha: now.date, hora: now.time },
    proximaToma: S.nextDose(data, now, tolerancia),
    adherencia: adherencia(data, now, 7, tolerancia),
    citas: proximasCitas(data, now),
    mediciones: ultimasMediciones(data),
    alertas: A.compute(data, now, tokenId).filter((a) => !a.visto)
  };
}

module.exports = { resumen, adherencia, proximasCitas, ultimasMediciones };
