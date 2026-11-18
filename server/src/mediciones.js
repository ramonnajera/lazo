// mediciones.js — validación de lo que la persona registra y avisos orientativos por rangos.
// Los rangos son una ayuda para que el cuidador mire con atención, NO un diagnóstico: cada persona puede ajustarlos
// en su perfil (`rangos`) con lo que le indique su médico.

const TIPOS = ['presion', 'glucosa', 'peso', 'animo', 'dolor'];

const RANGOS = {
  presion: { sistolicaMax: 140, sistolicaMin: 90, diastolicaMax: 90, diastolicaMin: 60, crisisSistolica: 180, crisisDiastolica: 120 },
  glucosa: { min: 70, max: 180, critMin: 54, critMax: 300 },
  dolor: { alto: 7 },
  animo: { bajo: 2 }
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Normaliza y valida; devuelve { ok, valor } o { ok: false, error }. */
function validar(tipo, valor) {
  if (!TIPOS.includes(tipo)) return { ok: false, error: `tipo debe ser uno de: ${TIPOS.join(', ')}` };
  const v = valor && typeof valor === 'object' ? valor : null;
  if (!v) return { ok: false, error: 'valor es obligatorio' };
  const rango = (x, min, max, nombre) => (num(x) !== null && x >= min && x <= max ? null : `${nombre} debe estar entre ${min} y ${max}`);
  let err = null;
  switch (tipo) {
    case 'presion':
      err = rango(v.sistolica, 40, 300, 'sistolica') || rango(v.diastolica, 20, 200, 'diastolica') || (v.pulso !== undefined ? rango(v.pulso, 20, 250, 'pulso') : null);
      if (!err && v.sistolica <= v.diastolica) err = 'la sistólica debe ser mayor que la diastólica';
      return err ? { ok: false, error: err } : { ok: true, valor: { sistolica: v.sistolica, diastolica: v.diastolica, ...(v.pulso !== undefined ? { pulso: v.pulso } : {}) } };
    case 'glucosa':
      err = rango(v.mgdl, 10, 800, 'mgdl');
      return err ? { ok: false, error: err } : { ok: true, valor: { mgdl: v.mgdl } };
    case 'peso':
      err = rango(v.kg, 1, 500, 'kg');
      return err ? { ok: false, error: err } : { ok: true, valor: { kg: v.kg } };
    case 'animo':
      err = rango(v.nivel, 1, 5, 'nivel');
      return err || !Number.isInteger(v.nivel) ? { ok: false, error: err || 'nivel debe ser entero' } : { ok: true, valor: { nivel: v.nivel } };
    default:
      err = rango(v.nivel, 0, 10, 'nivel');
      return err || !Number.isInteger(v.nivel) ? { ok: false, error: err || 'nivel debe ser entero' } : { ok: true, valor: { nivel: v.nivel } };
  }
}

/** null si está dentro de lo esperado; si no, { nivel: 'media' | 'alta', texto }. */
function evaluar(tipo, valor, rangos = {}) {
  const r = { ...RANGOS[tipo], ...(rangos[tipo] || {}) };
  if (tipo === 'presion') {
    const { sistolica: s, diastolica: d } = valor;
    if (s >= r.crisisSistolica || d >= r.crisisDiastolica) return { nivel: 'alta', texto: `Presión muy alta: ${s}/${d}` };
    if (s >= r.sistolicaMax || d >= r.diastolicaMax) return { nivel: 'media', texto: `Presión alta: ${s}/${d}` };
    if (s < r.sistolicaMin || d < r.diastolicaMin) return { nivel: 'media', texto: `Presión baja: ${s}/${d}` };
  } else if (tipo === 'glucosa') {
    const g = valor.mgdl;
    if (g <= r.critMin || g >= r.critMax) return { nivel: 'alta', texto: `Glucosa muy ${g <= r.critMin ? 'baja' : 'alta'}: ${g} mg/dL` };
    if (g < r.min || g > r.max) return { nivel: 'media', texto: `Glucosa ${g < r.min ? 'baja' : 'alta'}: ${g} mg/dL` };
  } else if (tipo === 'dolor' && valor.nivel >= r.alto) {
    return { nivel: 'media', texto: `Dolor ${valor.nivel} de 10` };
  } else if (tipo === 'animo' && valor.nivel <= r.bajo) {
    return { nivel: 'media', texto: `Ánimo bajo (${valor.nivel} de 5)` };
  }
  return null;
}

/** Texto corto y legible de una medición (también para leerlo en voz alta). */
function describir(tipo, v) {
  switch (tipo) {
    case 'presion': return `${v.sistolica}/${v.diastolica}${v.pulso ? `, pulso ${v.pulso}` : ''}`;
    case 'glucosa': return `${v.mgdl} mg/dL`;
    case 'peso': return `${v.kg} kg`;
    case 'animo': return `${v.nivel} de 5`;
    default: return `${v.nivel} de 10`;
  }
}

module.exports = { TIPOS, RANGOS, validar, evaluar, describir };
