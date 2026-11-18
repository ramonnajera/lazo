// app.js — API HTTP de Lazo. Sin dependencias: solo el módulo `http` de Node.
// `createApp` recibe todo lo externo (archivo de datos, reloj, descarga de convocatorias) para poder probarlo entero.

const { Store, newId, hashToken, newToken } = require('./store');
const T = require('./time');
const S = require('./schedule');
const M = require('./mediciones');
const A = require('./alerts');
const R = require('./resumen');
const C = require('./convocatorias');
const X = require('./textos');
const { interpretar, AYUDA_VOZ } = require('./comandos');

const VERSION = '1.0.0';
const MAX_BODY = 64 * 1024;
const DISCAPACIDADES = ['visual', 'motriz', 'ambas', 'otra'];
const ESTADOS_TOMA = ['tomada', 'omitida', 'pospuesta', 'pendiente'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);

// ---------- validación ----------

const texto = (v, nombre, { max = 120, obligatorio = false } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (obligatorio) throw bad(`${nombre} es obligatorio`);
    return '';
  }
  if (typeof v !== 'string') throw bad(`${nombre} debe ser texto`);
  const t = v.trim();
  if (obligatorio && !t) throw bad(`${nombre} es obligatorio`);
  if (t.length > max) throw bad(`${nombre} admite hasta ${max} caracteres`);
  return t;
};

function validarPerfil(b, previo = {}) {
  const p = { ...previo };
  if (b.nombre !== undefined || !previo.nombre) p.nombre = texto(b.nombre, 'nombre', { max: 80, obligatorio: true });
  if (b.discapacidad !== undefined || !previo.discapacidad) {
    const d = b.discapacidad ?? 'ambas';
    if (!DISCAPACIDADES.includes(d)) throw bad(`discapacidad debe ser una de: ${DISCAPACIDADES.join(', ')}`);
    p.discapacidad = d;
  }
  if (b.tolerancia !== undefined || previo.tolerancia === undefined) {
    const t = b.tolerancia ?? S.TOLERANCIA_MIN;
    if (!Number.isInteger(t) || t < 5 || t > 180) throw bad('tolerancia debe ser un entero entre 5 y 180 minutos');
    p.tolerancia = t;
  }
  if (b.rangos !== undefined) {
    if (!b.rangos || typeof b.rangos !== 'object' || Array.isArray(b.rangos)) throw bad('rangos debe ser un objeto');
    p.rangos = b.rangos;
  }
  if (b.preferencias !== undefined || !previo.preferencias) {
    const x = b.preferencias ?? {};
    p.preferencias = { textoGrande: x.textoGrande !== false, altoContraste: x.altoContraste === true, voz: x.voz !== false };
  }
  return p;
}

function validarMedicamento(b, previo, hoy) {
  const m = { ...previo };
  if (b.nombre !== undefined || !previo) m.nombre = texto(b.nombre, 'nombre', { max: 80, obligatorio: true });
  if (b.dosis !== undefined || !previo) m.dosis = texto(b.dosis, 'dosis', { max: 60 });
  if (b.instrucciones !== undefined || !previo) m.instrucciones = texto(b.instrucciones, 'instrucciones', { max: 200 });
  if (b.horarios !== undefined || !previo) {
    if (!Array.isArray(b.horarios) || !b.horarios.length || b.horarios.length > 12) throw bad('horarios debe tener de 1 a 12 horas HH:MM');
    if (!b.horarios.every(T.validTime)) throw bad('cada horario debe ser HH:MM (24 horas)');
    m.horarios = [...new Set(b.horarios)].sort();
  }
  if (b.dias !== undefined) {
    if (b.dias !== null && (!Array.isArray(b.dias) || !b.dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) throw bad('dias debe ser una lista de 0 (domingo) a 6 (sábado)');
    m.dias = b.dias && b.dias.length ? [...new Set(b.dias)].sort() : null;
  }
  if (b.inicio !== undefined || !previo) {
    if (b.inicio !== undefined && b.inicio !== null && !T.validDate(b.inicio)) throw bad('inicio debe ser YYYY-MM-DD');
    m.inicio = b.inicio || hoy; // un medicamento nuevo no genera dosis (ni alertas) de días anteriores
  }
  if (b.fin !== undefined) {
    if (b.fin !== null && !T.validDate(b.fin)) throw bad('fin debe ser YYYY-MM-DD');
    m.fin = b.fin;
  }
  if (m.fin && m.fin < m.inicio) throw bad('fin no puede ser anterior a inicio');
  if (b.existencias !== undefined) {
    if (b.existencias !== null && (!Number.isInteger(b.existencias) || b.existencias < 0 || b.existencias > 9999)) throw bad('existencias debe ser un entero de 0 a 9999');
    m.existencias = b.existencias;
  }
  if (b.activo !== undefined) {
    if (typeof b.activo !== 'boolean') throw bad('activo debe ser verdadero o falso');
    m.activo = b.activo;
  }
  return m;
}

function validarCita(b, previo) {
  const c = { ...previo };
  if (b.especialista !== undefined || !previo) c.especialista = texto(b.especialista, 'especialista', { max: 80, obligatorio: true });
  if (b.motivo !== undefined || !previo) c.motivo = texto(b.motivo, 'motivo', { max: 120 });
  if (b.lugar !== undefined || !previo) c.lugar = texto(b.lugar, 'lugar', { max: 120 });
  if (b.notas !== undefined || !previo) c.notas = texto(b.notas, 'notas', { max: 300 });
  if (b.transporte !== undefined || !previo) c.transporte = texto(b.transporte, 'transporte', { max: 120 });
  if (b.fecha !== undefined || !previo) {
    if (!T.validDate(b.fecha)) throw bad('fecha debe ser YYYY-MM-DD');
    c.fecha = b.fecha;
  }
  if (b.hora !== undefined || !previo) {
    if (!T.validTime(b.hora)) throw bad('hora debe ser HH:MM (24 horas)');
    c.hora = b.hora;
  }
  return c;
}

// ---------- aplicación ----------

function createApp({ dataFile = null, now = () => new Date(), fetchHtml = C.descargar, convUrl = C.PAGE_URL } = {}) {
  const store = new Store(dataFile);
  const ahora = () => T.local(now());
  let ultimaActualizacionConv = 0;
  const intentosUnirse = []; // marcas de tiempo de intentos fallidos (límite contra adivinar códigos)

  const rutas = [];
  const ruta = (method, re, acceso, fn) => rutas.push({ method, re, acceso, fn });

  const idDeToken = (d, token) => {
    const h = hashToken(token);
    return d.tokens.find((t) => t.hash === h) || null;
  };

  // ----- públicas -----
  ruta('GET', /^\/health$/, 'publica', ({ d }) => ({ ok: true, version: VERSION, configurado: !!d.perfil }));

  ruta('POST', /^\/perfil$/, 'publica', ({ d, body, res }) => {
    if (d.perfil) throw new HttpError(409, 'ya hay un perfil: este servidor pertenece a una persona');
    const perfil = validarPerfil(body);
    const token = newToken();
    store.mutate((x) => {
      x.perfil = { ...perfil, creado: ahora().date };
      x.tokens.push({ id: newId(), hash: hashToken(token), rol: 'persona', nombre: perfil.nombre, creado: ahora().date });
    });
    res.status = 201;
    return { perfil: store.data.perfil, token };
  });

  ruta('POST', /^\/circulo\/unirse$/, 'publica', ({ body, res }) => {
    const t = now().getTime();
    while (intentosUnirse.length && t - intentosUnirse[0] > 15 * 60000) intentosUnirse.shift();
    if (intentosUnirse.length >= 8) throw new HttpError(429, 'demasiados intentos: espera unos minutos');
    const codigo = texto(body.codigo, 'codigo', { max: 12, obligatorio: true });
    const nombre = texto(body.nombre, 'nombre', { max: 60, obligatorio: true });
    const parentesco = texto(body.parentesco, 'parentesco', { max: 40 });
    const inv = store.data.invitaciones.find((i) => i.codigo === codigo && !i.usada && i.expira > t && i.tipo !== 'dispositivo');
    if (!inv) {
      intentosUnirse.push(t);
      throw new HttpError(404, 'el código no existe, ya se usó o venció');
    }
    const token = newToken();
    store.mutate((x) => {
      x.invitaciones = x.invitaciones.filter((i) => i !== x.invitaciones.find((j) => j.codigo === codigo));
      x.tokens.push({ id: newId(), hash: hashToken(token), rol: 'cuidador', nombre, parentesco, creado: ahora().date });
    });
    res.status = 201;
    return { token, persona: { nombre: store.data.perfil.nombre } };
  });

  // Vincular otro dispositivo de la misma persona (teléfono + computadora): código de 6 dígitos, 24 h, un solo uso.
  ruta('POST', /^\/perfil\/vincular\/unirse$/, 'publica', ({ d, body, res }) => {
    const t = now().getTime();
    while (intentosUnirse.length && t - intentosUnirse[0] > 15 * 60000) intentosUnirse.shift();
    if (intentosUnirse.length >= 8) throw new HttpError(429, 'demasiados intentos: espera unos minutos');
    const codigo = texto(body.codigo, 'codigo', { max: 12, obligatorio: true });
    const nombre = texto(body.nombre, 'nombre', { max: 60 }) || 'Otro dispositivo';
    const inv = d.invitaciones.find((i) => i.codigo === codigo && !i.usada && i.expira > t && i.tipo === 'dispositivo');
    if (!inv) {
      intentosUnirse.push(t);
      throw new HttpError(404, 'el código no existe, ya se usó o venció');
    }
    const token = newToken();
    store.mutate((x) => {
      x.invitaciones = x.invitaciones.filter((i) => i !== inv);
      x.tokens.push({ id: newId(), hash: hashToken(token), rol: 'persona', nombre, creado: ahora().date });
    });
    res.status = 201;
    return { token, perfil: store.data.perfil };
  });

  // ----- persona o cuidador (lectura) -----
  ruta('GET', /^\/perfil$/, 'cualquiera', ({ d }) => ({ perfil: d.perfil }));
  ruta('GET', /^\/medicamentos$/, 'cualquiera', ({ d }) => ({ medicamentos: [...d.medicamentos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }));

  ruta('GET', /^\/tomas$/, 'cualquiera', ({ d, query }) => {
    const n = ahora();
    const fecha = query.get('fecha') || n.date;
    if (!T.validDate(fecha)) throw bad('fecha debe ser YYYY-MM-DD');
    return { fecha, ahora: { fecha: n.date, hora: n.time }, tomas: S.dayView(d, fecha, n, (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN) };
  });

  ruta('GET', /^\/proxima$/, 'cualquiera', ({ d }) => {
    const n = ahora();
    return { ahora: { fecha: n.date, hora: n.time }, dosis: S.nextDose(d, n, (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN) };
  });

  ruta('GET', /^\/citas$/, 'cualquiera', ({ d, query }) => {
    const desde = query.get('desde') || (query.get('todas') ? '0000-01-01' : ahora().date);
    if (!T.validDate(desde) && desde !== '0000-01-01') throw bad('desde debe ser YYYY-MM-DD');
    return { citas: d.citas.filter((c) => c.fecha >= desde).sort((a, b) => T.absMin(a.fecha, a.hora) - T.absMin(b.fecha, b.hora)) };
  });

  ruta('GET', /^\/mediciones$/, 'cualquiera', ({ d, query }) => {
    const tipo = query.get('tipo');
    if (tipo && !M.TIPOS.includes(tipo)) throw bad(`tipo debe ser uno de: ${M.TIPOS.join(', ')}`);
    const dias = Number(query.get('dias') || 30);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw bad('dias debe ser un entero de 1 a 365');
    const desde = T.addDays(ahora().date, -dias);
    const rangos = (d.perfil && d.perfil.rangos) || {};
    const lista = d.mediciones
      .filter((m) => m.fecha >= desde && (!tipo || m.tipo === tipo))
      .sort((a, b) => T.absMin(b.fecha, b.hora) - T.absMin(a.fecha, a.hora))
      .map((m) => ({ ...m, texto: M.describir(m.tipo, m.valor), aviso: M.evaluar(m.tipo, m.valor, rangos) }));
    return { mediciones: lista };
  });

  ruta('GET', /^\/alertas$/, 'cualquiera', ({ d, auth }) => ({ alertas: A.compute(d, ahora(), auth.id) }));

  ruta('POST', /^\/alertas\/([^/]+)\/visto$/, 'cualquiera', ({ auth, m }) => {
    const id = decodeURIComponent(m[1]);
    store.mutate((x) => {
      const v = x.vistos[auth.id] || (x.vistos[auth.id] = []);
      if (!v.includes(id)) v.push(id);
      if (v.length > 500) v.splice(0, v.length - 500);
    });
    return { ok: true };
  });

  ruta('GET', /^\/circulo\/resumen$/, 'cualquiera', ({ d, auth }) => R.resumen(d, ahora(), auth.id));

  ruta('GET', /^\/convocatorias$/, 'cualquiera', ({ d, query }) => {
    const c = d.convocatorias;
    const soloDisc = query.get('discapacidad') === '1';
    return { items: c.items.filter((i) => !soloDisc || i.discapacidad), ultimaLectura: c.ultimaLectura, error: c.error || null, fuente: convUrl, nuevas: (c.nuevas || []).map((n) => n.id) };
  });

  // ----- solo la persona (escritura y administración) -----
  ruta('PATCH', /^\/perfil$/, 'persona', ({ d, body }) => {
    const perfil = validarPerfil(body, d.perfil);
    store.mutate((x) => {
      x.perfil = perfil;
    });
    return { perfil };
  });

  ruta('POST', /^\/medicamentos$/, 'persona', ({ body, res }) => {
    const m = { id: newId(), ...validarMedicamento(body, null, ahora().date), creado: ahora().date };
    store.mutate((x) => x.medicamentos.push(m));
    res.status = 201;
    return { medicamento: m };
  });

  ruta('PATCH', /^\/medicamentos\/([0-9a-f]{10})$/, 'persona', ({ d, body, m }) => {
    const previo = d.medicamentos.find((x) => x.id === m[1]);
    if (!previo) throw new HttpError(404, 'medicamento no encontrado');
    const nuevo = validarMedicamento(body, previo, ahora().date);
    store.mutate((x) => {
      x.medicamentos[x.medicamentos.indexOf(previo)] = nuevo;
    });
    return { medicamento: nuevo };
  });

  ruta('DELETE', /^\/medicamentos\/([0-9a-f]{10})$/, 'persona', ({ d, m }) => {
    if (!d.medicamentos.some((x) => x.id === m[1])) throw new HttpError(404, 'medicamento no encontrado');
    store.mutate((x) => {
      x.medicamentos = x.medicamentos.filter((y) => y.id !== m[1]);
      x.tomas = x.tomas.filter((t) => t.medicamentoId !== m[1]);
    });
    return { ok: true };
  });

  /** Registra una toma (tomada, omitida, pospuesta o deshacer). La usan POST /tomas y las órdenes por voz. */
  function aplicarToma(d, body) {
    const n = ahora();
    const med = d.medicamentos.find((x) => x.id === body.medicamentoId);
    if (!med) throw new HttpError(404, 'medicamento no encontrado');
    if (!T.validDate(body.fecha) || !T.validTime(body.hora)) throw bad('fecha (YYYY-MM-DD) y hora (HH:MM) son obligatorias');
    if (!ESTADOS_TOMA.includes(body.estado)) throw bad(`estado debe ser uno de: ${ESTADOS_TOMA.join(', ')}`);
    if (body.fecha > T.addDays(n.date, 1)) throw bad('no se puede registrar una toma de más de un día adelante');
    if (!S.dosesFor([med], body.fecha).some((x) => x.hora === body.hora)) throw new HttpError(404, 'esa dosis no existe en el calendario del medicamento');
    let hasta = null;
    if (body.estado === 'pospuesta') {
      const min = body.minutos === undefined ? 10 : body.minutos;
      if (!Number.isInteger(min) || min < 5 || min > 180) throw bad('minutos debe ser un entero de 5 a 180');
      hasta = T.fromAbsMin(T.absMin(n.date, n.time) + min);
    }
    store.mutate((x) => {
      const i = x.tomas.findIndex((t) => t.medicamentoId === med.id && t.fecha === body.fecha && t.hora === body.hora);
      const previa = i >= 0 ? x.tomas[i] : null;
      if (i >= 0) x.tomas.splice(i, 1);
      if (body.estado !== 'pendiente') {
        x.tomas.push({ medicamentoId: med.id, fecha: body.fecha, hora: body.hora, estado: body.estado, ...(body.estado === 'tomada' ? { horaReal: n.time } : {}), ...(hasta ? { hasta: { fecha: hasta.date, hora: hasta.time } } : {}), registrado: `${n.date}T${n.time}:00-06:00` });
      }
      const medX = x.medicamentos.find((y) => y.id === med.id);
      if (typeof medX.existencias === 'number') {
        const antes = previa && previa.estado === 'tomada';
        const ahoraTomada = body.estado === 'tomada';
        if (ahoraTomada && !antes) medX.existencias = Math.max(0, medX.existencias - 1);
        if (!ahoraTomada && antes) medX.existencias += 1;
      }
    });
    const vista = S.dayView(store.data, body.fecha, n, (store.data.perfil && store.data.perfil.tolerancia) || S.TOLERANCIA_MIN).find((x) => x.medicamentoId === med.id && x.hora === body.hora);
    return { toma: vista, existencias: store.data.medicamentos.find((y) => y.id === med.id).existencias ?? null };
  }

  ruta('POST', /^\/tomas$/, 'persona', ({ d, body }) => aplicarToma(d, body));

  // Órdenes en español, por voz o por texto (la isla de Windows y el chat las envían aquí).
  ruta('POST', /^\/voz$/, 'persona', ({ d, body }) => {
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
    if (!texto) throw bad('texto es obligatorio');
    if (texto.length > 300) throw bad('texto admite hasta 300 caracteres');
    const n = ahora();
    const tolerancia = (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN;
    const hoy = S.dayView(d, n.date, n, tolerancia);
    const dosis = hoy.find((x) => X.requiereAtencion(x.estado)) || hoy.find((x) => x.estado === 'pendiente' || x.estado === 'pospuesta');
    const c = interpretar(texto);
    const registrar = (estado, minutos) => aplicarToma(d, { medicamentoId: dosis.medicamentoId, fecha: dosis.fecha, hora: dosis.hora, estado, ...(minutos ? { minutos } : {}) });
    const sinToma = { reply: 'No tienes ninguna toma pendiente.', accion: { tipo: c.tipo, hecho: false } };
    switch (c.tipo) {
      case 'tomada':
        if (!dosis) return sinToma;
        registrar('tomada');
        return { reply: `Listo. Registré ${X.textoDosis(dosis.nombre, dosis.dosis)} como tomada.`, accion: { tipo: 'tomada', hecho: true, medicamentoId: dosis.medicamentoId, hora: dosis.hora } };
      case 'omitir':
        if (!dosis) return sinToma;
        registrar('omitida');
        return { reply: `De acuerdo. Marqué ${dosis.nombre} como omitida.`, accion: { tipo: 'omitir', hecho: true, medicamentoId: dosis.medicamentoId, hora: dosis.hora } };
      case 'posponer':
        if (!dosis) return sinToma;
        registrar('pospuesta', c.minutos);
        return { reply: `Te lo recuerdo en ${c.minutos} minutos.`, accion: { tipo: 'posponer', hecho: true, minutos: c.minutos, medicamentoId: dosis.medicamentoId, hora: dosis.hora } };
      case 'siguiente':
        return { reply: X.fraseSiguiente(S.nextDose(d, n, tolerancia), n.date), accion: { tipo: 'siguiente', hecho: true } };
      case 'hoy':
        return { reply: X.fraseHoy(hoy, n.date), accion: { tipo: 'hoy', hecho: true } };
      case 'citas':
        return { reply: X.fraseCitas(R.proximasCitas(d, n), n.date), accion: { tipo: 'citas', hecho: true } };
      case 'convocatorias': {
        const nombres = d.convocatorias.items.filter((i) => i.discapacidad).map((i) => i.nombre);
        const reply = !nombres.length
          ? 'Todavía no hay convocatorias guardadas. Abre la sección de apoyos para actualizarlas.'
          : `Hay ${X.plural(nombres.length, 'convocatoria', 'convocatorias')} para personas con discapacidad: ${nombres.slice(0, 3).join('; ')}${nombres.length > 3 ? '; y más' : ''}.`;
        return { reply, accion: { tipo: 'convocatorias', hecho: true } };
      }
      case 'ayuda':
        return { reply: AYUDA_VOZ, accion: { tipo: 'ayuda', hecho: true } };
      default:
        return { reply: 'No te entendí. Di ayuda para saber qué puedes pedirme.', accion: { tipo: 'desconocido', hecho: false } };
    }
  });

  ruta('POST', /^\/citas$/, 'persona', ({ body, res }) => {
    const c = { id: newId(), ...validarCita(body, null) };
    store.mutate((x) => x.citas.push(c));
    res.status = 201;
    return { cita: c };
  });

  ruta('PATCH', /^\/citas\/([0-9a-f]{10})$/, 'persona', ({ d, body, m }) => {
    const previa = d.citas.find((x) => x.id === m[1]);
    if (!previa) throw new HttpError(404, 'cita no encontrada');
    const nueva = validarCita(body, previa);
    store.mutate((x) => {
      x.citas[x.citas.indexOf(previa)] = nueva;
    });
    return { cita: nueva };
  });

  ruta('DELETE', /^\/citas\/([0-9a-f]{10})$/, 'persona', ({ d, m }) => {
    if (!d.citas.some((x) => x.id === m[1])) throw new HttpError(404, 'cita no encontrada');
    store.mutate((x) => {
      x.citas = x.citas.filter((y) => y.id !== m[1]);
    });
    return { ok: true };
  });

  ruta('POST', /^\/mediciones$/, 'persona', ({ d, body, res }) => {
    const v = M.validar(body.tipo, body.valor);
    if (!v.ok) throw bad(v.error);
    const n = ahora();
    const fecha = body.fecha === undefined ? n.date : body.fecha;
    const hora = body.hora === undefined ? n.time : body.hora;
    if (!T.validDate(fecha) || !T.validTime(hora)) throw bad('fecha (YYYY-MM-DD) u hora (HH:MM) inválida');
    const med = { id: newId(), tipo: body.tipo, valor: v.valor, nota: texto(body.nota, 'nota', { max: 200 }), fecha, hora };
    store.mutate((x) => x.mediciones.push(med));
    res.status = 201;
    return { medicion: { ...med, texto: M.describir(med.tipo, med.valor) }, aviso: M.evaluar(med.tipo, med.valor, (d.perfil && d.perfil.rangos) || {}) };
  });

  ruta('DELETE', /^\/mediciones\/([0-9a-f]{10})$/, 'persona', ({ d, m }) => {
    if (!d.mediciones.some((x) => x.id === m[1])) throw new HttpError(404, 'medición no encontrada');
    store.mutate((x) => {
      x.mediciones = x.mediciones.filter((y) => y.id !== m[1]);
    });
    return { ok: true };
  });

  ruta('POST', /^\/circulo\/invitacion$/, 'persona', ({ res }) => {
    const t = now().getTime();
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    store.mutate((x) => {
      x.invitaciones = x.invitaciones.filter((i) => !i.usada && i.expira > t).slice(-4); // máximo 5 códigos vigentes
      x.invitaciones.push({ codigo, expira: t + 24 * 3600 * 1000, usada: false });
    });
    res.status = 201;
    return { codigo, expira: new Date(t + 24 * 3600 * 1000).toISOString() };
  });

  ruta('POST', /^\/perfil\/vincular$/, 'persona', ({ res }) => {
    const t = now().getTime();
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    store.mutate((x) => {
      x.invitaciones = x.invitaciones.filter((i) => !i.usada && i.expira > t).slice(-4);
      x.invitaciones.push({ codigo, expira: t + 24 * 3600 * 1000, usada: false, tipo: 'dispositivo' });
    });
    res.status = 201;
    return { codigo, expira: new Date(t + 24 * 3600 * 1000).toISOString() };
  });

  ruta('GET', /^\/dispositivos$/, 'persona', ({ d }) => ({ dispositivos: d.tokens.filter((t) => t.rol === 'persona').map(({ id, nombre, creado }) => ({ id, nombre, creado })) }));

  ruta('DELETE', /^\/dispositivos\/([0-9a-f]{10})$/, 'persona', ({ d, m, auth }) => {
    const t = d.tokens.find((x) => x.id === m[1] && x.rol === 'persona');
    if (!t) throw new HttpError(404, 'dispositivo no encontrado');
    if (t.id === auth.id) throw bad('no puedes quitar el acceso del dispositivo que estás usando');
    store.mutate((x) => {
      x.tokens = x.tokens.filter((y) => y !== t);
      delete x.vistos[t.id];
    });
    return { ok: true };
  });

  ruta('GET', /^\/circulo$/, 'persona', ({ d }) => ({ cuidadores: d.tokens.filter((t) => t.rol === 'cuidador').map(({ id, nombre, parentesco, creado }) => ({ id, nombre, parentesco, creado })) }));

  ruta('DELETE', /^\/circulo\/([0-9a-f]{10})$/, 'persona', ({ d, m }) => {
    const t = d.tokens.find((x) => x.id === m[1] && x.rol === 'cuidador');
    if (!t) throw new HttpError(404, 'cuidador no encontrado');
    store.mutate((x) => {
      x.tokens = x.tokens.filter((y) => y !== t);
      delete x.vistos[t.id];
    });
    return { ok: true };
  });

  ruta('POST', /^\/convocatorias\/actualizar$/, 'persona', async ({ d }) => {
    const t = now().getTime();
    if (t - ultimaActualizacionConv < 60000) throw new HttpError(429, 'ya se actualizó hace menos de un minuto');
    ultimaActualizacionConv = t;
    const r = await C.actualizar(store, { fetchHtml, url: convUrl, now: ahora() });
    return { ...r, ultimaLectura: store.data.convocatorias.ultimaLectura };
  });

  // ----- servidor -----
  async function leerCuerpo(req) {
    const partes = [];
    let total = 0;
    for await (const c of req) {
      total += c.length;
      if (total > MAX_BODY) throw new HttpError(413, 'el cuerpo es demasiado grande');
      partes.push(c);
    }
    if (!total) return {};
    try {
      const b = JSON.parse(Buffer.concat(partes).toString('utf8'));
      if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
      return b;
    } catch {
      throw bad('el cuerpo debe ser un objeto JSON válido');
    }
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    const send = (status, obj) => {
      const data = JSON.stringify(obj);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' });
      res.end(data);
    };
    try {
      const candidatas = rutas.filter((r) => r.re.test(url.pathname));
      if (!candidatas.length) throw new HttpError(404, 'ruta no encontrada');
      const r = candidatas.find((x) => x.method === req.method);
      if (!r) throw new HttpError(405, 'método no permitido');
      let auth = null;
      if (r.acceso !== 'publica') {
        const h = req.headers.authorization || '';
        const tk = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
        auth = tk ? idDeToken(store.data, tk) : null;
        if (!auth) throw new HttpError(401, 'falta el token o no es válido');
        if (r.acceso === 'persona' && auth.rol !== 'persona') throw new HttpError(403, 'el cuidador solo puede consultar');
      }
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await leerCuerpo(req);
      const ctx = { d: store.data, body, query: url.searchParams, auth, m: url.pathname.match(r.re), res: { status: 200 } };
      const out = await r.fn(ctx);
      send(ctx.res.status, out);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      console.error('[lazo] error interno:', e);
      send(500, { error: 'error interno' });
    }
  }

  return { handler, store };
}

module.exports = { createApp, VERSION };
