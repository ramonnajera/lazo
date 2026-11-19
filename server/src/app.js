// app.js — API HTTP de Lazo. Sin dependencias: solo el módulo `http` de Node.
// `createApp` recibe todo lo externo (archivo de datos, reloj, descarga de convocatorias) para poder probarlo entero.

const { Store, newId, hashToken, newToken, hogarVacio } = require('./store');
const T = require('./time');
const S = require('./schedule');
const M = require('./mediciones');
const A = require('./alerts');
const R = require('./resumen');
const C = require('./convocatorias');
const X = require('./textos');
const { interpretar, AYUDA_VOZ } = require('./comandos');
const Tr = require('./transcribir');
const Conv = require('./conversacion');
const Rs = require('./resurtir');

const VERSION = '1.0.0';
const MAX_BODY = 64 * 1024;
const MAX_AUDIO = 10 * 1024 * 1024;
const MIMES_AUDIO = /^audio\/(mp4|m4a|aac|mpeg|ogg|webm|wav|x-wav|3gpp)$/;
const DISCAPACIDADES = ['visual', 'motriz', 'ambas', 'otra'];
const ESTADOS_TOMA = ['tomada', 'omitida', 'pospuesta', 'pendiente'];
const PREFERENCIAS = { textoGrande: true, altoContraste: false, voz: true };
const DIAS_ATRAS_TOMAS = 30; // se puede corregir una toma de hasta 30 días atrás
const MAX_AYUDAS = 100;
const AYUDA_REPETIDA_MS = 60 * 1000;

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
  if (b.rangos !== undefined) p.rangos = validarRangos(b.rangos);
  if (b.preferencias !== undefined || !previo.preferencias) {
    const x = b.preferencias ?? {};
    if (typeof x !== 'object' || Array.isArray(x)) throw bad('preferencias debe ser un objeto');
    // Solo cambia lo que se manda: «altoContraste» no debe reiniciar «textoGrande» ni «voz».
    p.preferencias = { ...PREFERENCIAS, ...(previo.preferencias || {}) };
    for (const k of Object.keys(PREFERENCIAS)) {
      if (x[k] === undefined) continue;
      if (typeof x[k] !== 'boolean') throw bad(`preferencias.${k} debe ser verdadero o falso`);
      p.preferencias[k] = x[k];
    }
  }
  return p;
}

/** Rangos propios que fija el médico: solo tipos y límites conocidos, con números de 0 a 1000. */
function validarRangos(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw bad('rangos debe ser un objeto');
  const out = {};
  for (const [tipo, limites] of Object.entries(r)) {
    if (!M.RANGOS[tipo]) throw bad(`rangos: el tipo ${String(tipo).slice(0, 20)} no existe (usa ${Object.keys(M.RANGOS).join(', ')})`);
    if (!limites || typeof limites !== 'object' || Array.isArray(limites)) throw bad(`rangos.${tipo} debe ser un objeto`);
    out[tipo] = {};
    for (const [k, v] of Object.entries(limites)) {
      if (!(k in M.RANGOS[tipo])) throw bad(`rangos.${tipo}: el límite ${String(k).slice(0, 20)} no existe (usa ${Object.keys(M.RANGOS[tipo]).join(', ')})`);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000) throw bad(`rangos.${tipo}.${k} debe ser un número de 0 a 1000`);
      out[tipo][k] = v;
    }
  }
  return out;
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

function createApp({ dataFile = null, now = () => new Date(), fetchHtml = C.descargar, convUrl = C.PAGE_URL, maxHogares = 200, transcribir = null, llm = undefined } = {}) {
  const store = new Store(dataFile);
  const ahora = () => T.local(now());
  let ultimaActualizacionConv = 0;
  const intentosUnirse = []; // marcas de tiempo de intentos fallidos (límite contra adivinar códigos)
  const altasRecientes = []; // marcas de tiempo de los hogares creados en la última hora (límite anti-abuso)
  const MAX_ALTAS_POR_HORA = 30;

  const rutas = [];
  const ruta = (method, re, acceso, fn, opciones = {}) => rutas.push({ method, re, acceso, fn, ...opciones });
  const memoriaChat = Conv.memoria(() => now().getTime());
  const chatsPorDia = new Map(); // id de token → { fecha, n } (tope diario para cuidar el gasto del modelo)
  const MAX_CHATS_POR_DIA = 80;
  const audiosPorToken = new Map(); // id de token → marcas de tiempo (límite de audios por minuto)

  const hogares = () => Object.values(store.data.hogares);

  /** Busca el token en todos los hogares. Devuelve el hogar al que pertenece y la ficha del token. */
  const buscarToken = (token) => {
    const hash = hashToken(token);
    for (const h of hogares()) {
      const tk = h.tokens.find((t) => t.hash === hash);
      if (tk) return { h, tk };
    }
    return null;
  };

  /** Vista de solo lectura de un hogar: sus datos más las convocatorias, que son comunes a todos. */
  const vista = (h) => Object.assign(Object.create(h), { convocatorias: store.data.convocatorias });

  /** Cambia los datos de un hogar y guarda el archivo. */
  const mutar = (h, fn) => store.mutate(() => fn(h));

  /** Busca una invitación vigente (de cuidador o de dispositivo) en cualquier hogar. */
  const buscarInvitacion = (codigo, tipo, t) => {
    for (const h of hogares()) {
      const inv = h.invitaciones.find((i) => i.codigo === codigo && !i.usada && i.expira > t && (i.tipo || 'cuidador') === tipo);
      if (inv) return { h, inv };
    }
    return null;
  };

  /** Genera un código de 6 dígitos que no se repite en ninguna invitación vigente de ningún hogar. */
  const codigoNuevo = (t) => {
    const usados = new Set(hogares().flatMap((h) => h.invitaciones.filter((i) => !i.usada && i.expira > t).map((i) => i.codigo)));
    for (;;) {
      const c = String(Math.floor(100000 + Math.random() * 900000));
      if (!usados.has(c)) return c;
    }
  };

  const limitarIntentos = (t) => {
    while (intentosUnirse.length && t - intentosUnirse[0] > 15 * 60000) intentosUnirse.shift();
    if (intentosUnirse.length >= 8) throw new HttpError(429, 'demasiados intentos: espera unos minutos');
  };

  // ----- públicas -----
  ruta('GET', /^\/health$/, 'publica', () => {
    const n = hogares().length;
    return { ok: true, version: VERSION, configurado: n > 0, abierto: n < maxHogares };
  });

  ruta('POST', /^\/perfil$/, 'publica', ({ body, res }) => {
    const n = hogares().length;
    if (maxHogares === 1 && n >= 1) throw new HttpError(409, 'ya hay un perfil: este servidor pertenece a una persona');
    if (n >= maxHogares) throw new HttpError(503, 'este servidor no admite más personas');
    const t = now().getTime();
    while (altasRecientes.length && t - altasRecientes[0] > 3600000) altasRecientes.shift();
    if (altasRecientes.length >= MAX_ALTAS_POR_HORA) throw new HttpError(429, 'se están creando demasiados perfiles: intenta más tarde');
    const perfil = validarPerfil(body);
    const token = newToken();
    const h = { ...hogarVacio(), perfil: { ...perfil, creado: ahora().date } };
    h.tokens.push({ id: newId(), hash: hashToken(token), rol: 'persona', nombre: perfil.nombre, creado: ahora().date });
    store.mutate((x) => {
      x.hogares[newId()] = h;
    });
    altasRecientes.push(t);
    res.status = 201;
    return { perfil: h.perfil, token };
  });

  ruta('POST', /^\/circulo\/unirse$/, 'publica', ({ body, res }) => {
    const t = now().getTime();
    limitarIntentos(t);
    const codigo = texto(body.codigo, 'codigo', { max: 12, obligatorio: true });
    const nombre = texto(body.nombre, 'nombre', { max: 60, obligatorio: true });
    const parentesco = texto(body.parentesco, 'parentesco', { max: 40 });
    const hallada = buscarInvitacion(codigo, 'cuidador', t);
    if (!hallada) {
      intentosUnirse.push(t);
      throw new HttpError(404, 'el código no existe, ya se usó o venció');
    }
    const { h, inv } = hallada;
    const token = newToken();
    mutar(h, (x) => {
      x.invitaciones = x.invitaciones.filter((i) => i !== inv);
      x.tokens.push({ id: newId(), hash: hashToken(token), rol: 'cuidador', nombre, parentesco, creado: ahora().date });
    });
    res.status = 201;
    return { token, persona: { nombre: h.perfil.nombre } };
  });

  // Vincular otro dispositivo de la misma persona (teléfono + computadora): código de 6 dígitos, 24 h, un solo uso.
  ruta('POST', /^\/perfil\/vincular\/unirse$/, 'publica', ({ body, res }) => {
    const t = now().getTime();
    limitarIntentos(t);
    const codigo = texto(body.codigo, 'codigo', { max: 12, obligatorio: true });
    const nombre = texto(body.nombre, 'nombre', { max: 60 }) || 'Otro dispositivo';
    const hallada = buscarInvitacion(codigo, 'dispositivo', t);
    if (!hallada) {
      intentosUnirse.push(t);
      throw new HttpError(404, 'el código no existe, ya se usó o venció');
    }
    const { h, inv } = hallada;
    const token = newToken();
    mutar(h, (x) => {
      x.invitaciones = x.invitaciones.filter((i) => i !== inv);
      x.tokens.push({ id: newId(), hash: hashToken(token), rol: 'persona', nombre, creado: ahora().date });
    });
    res.status = 201;
    return { token, perfil: h.perfil };
  });

  // ----- persona o cuidador (lectura) -----
  ruta('GET', /^\/perfil$/, 'cualquiera', ({ h, d }) => ({ perfil: d.perfil }));
  ruta('GET', /^\/medicamentos$/, 'cualquiera', ({ h, d }) => ({ medicamentos: [...d.medicamentos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }));

  ruta('GET', /^\/tomas$/, 'cualquiera', ({ h, d, query }) => {
    const n = ahora();
    const fecha = query.get('fecha') || n.date;
    if (!T.validDate(fecha)) throw bad('fecha debe ser YYYY-MM-DD');
    return { fecha, ahora: { fecha: n.date, hora: n.time }, tomas: S.dayView(d, fecha, n, (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN) };
  });

  ruta('GET', /^\/proxima$/, 'cualquiera', ({ h, d }) => {
    const n = ahora();
    return { ahora: { fecha: n.date, hora: n.time }, dosis: S.nextDose(d, n, (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN) };
  });

  ruta('GET', /^\/citas$/, 'cualquiera', ({ h, d, query }) => {
    const desde = query.get('desde') || (query.get('todas') ? '0000-01-01' : ahora().date);
    if (!T.validDate(desde) && desde !== '0000-01-01') throw bad('desde debe ser YYYY-MM-DD');
    return { citas: d.citas.filter((c) => c.fecha >= desde).sort((a, b) => T.absMin(a.fecha, a.hora) - T.absMin(b.fecha, b.hora)) };
  });

  ruta('GET', /^\/mediciones$/, 'cualquiera', ({ h, d, query }) => {
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

  ruta('GET', /^\/alertas$/, 'cualquiera', ({ h, d, auth }) => ({ alertas: A.compute(d, ahora(), auth.id) }));

  ruta('POST', /^\/alertas\/([^/]+)\/visto$/, 'cualquiera', ({ h, auth, m }) => {
    let id;
    try {
      id = decodeURIComponent(m[1]);
    } catch {
      throw bad('el id de la alerta no es válido');
    }
    if (id.length > 200) throw bad('el id de la alerta no es válido');
    mutar(h, (x) => {
      const v = x.vistos[auth.id] || (x.vistos[auth.id] = []);
      if (!v.includes(id)) v.push(id);
      if (v.length > 500) v.splice(0, v.length - 500);
    });
    return { ok: true };
  });

  ruta('GET', /^\/resurtir$/, 'cualquiera', ({ d }) => ({ medicamentos: Rs.estimar(d, ahora(), (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN) }));

  ruta('GET', /^\/circulo\/resumen$/, 'cualquiera', ({ h, d, auth }) => R.resumen(d, ahora(), auth.id));

  ruta('GET', /^\/convocatorias$/, 'cualquiera', ({ h, d, query }) => {
    const c = d.convocatorias;
    const soloDisc = query.get('discapacidad') === '1';
    return { items: c.items.filter((i) => !soloDisc || i.discapacidad), ultimaLectura: c.ultimaLectura, error: c.error || null, fuente: convUrl, nuevas: (c.nuevas || []).map((n) => n.id) };
  });

  // ----- solo la persona (escritura y administración) -----
  ruta('PATCH', /^\/perfil$/, 'persona', ({ h, d, body }) => {
    const perfil = validarPerfil(body, d.perfil);
    mutar(h, (x) => {
      x.perfil = perfil;
    });
    return { perfil };
  });

  ruta('POST', /^\/medicamentos$/, 'persona', ({ h, d, body, res }) => {
    const m = { id: newId(), ...validarMedicamento(body, null, ahora().date), creado: ahora().date };
    const igual = d.medicamentos.find((x) => x.activo !== false && x.nombre.toLowerCase() === m.nombre.toLowerCase() && x.dosis === m.dosis && JSON.stringify(x.horarios) === JSON.stringify(m.horarios) && x.creado === m.creado);
    if (igual) return { medicamento: igual, repetida: true }; // doble toque: la misma medicina, hoy, no se agrega dos veces
    mutar(h, (x) => x.medicamentos.push(m));
    res.status = 201;
    return { medicamento: m };
  });

  ruta('PATCH', /^\/medicamentos\/([0-9a-f]{10})$/, 'persona', ({ h, d, body, m }) => {
    const previo = d.medicamentos.find((x) => x.id === m[1]);
    if (!previo) throw new HttpError(404, 'medicamento no encontrado');
    const nuevo = validarMedicamento(body, previo, ahora().date);
    mutar(h, (x) => {
      x.medicamentos[x.medicamentos.indexOf(previo)] = nuevo;
    });
    return { medicamento: nuevo };
  });

  ruta('DELETE', /^\/medicamentos\/([0-9a-f]{10})$/, 'persona', ({ h, d, m }) => {
    if (!d.medicamentos.some((x) => x.id === m[1])) throw new HttpError(404, 'medicamento no encontrado');
    mutar(h, (x) => {
      x.medicamentos = x.medicamentos.filter((y) => y.id !== m[1]);
      x.tomas = x.tomas.filter((t) => t.medicamentoId !== m[1]);
    });
    return { ok: true };
  });

  /** Registra una toma (tomada, omitida, pospuesta o deshacer). La usan POST /tomas y las órdenes por voz. */
  function aplicarToma(h, d, body) {
    const n = ahora();
    const med = d.medicamentos.find((x) => x.id === body.medicamentoId);
    if (!med) throw new HttpError(404, 'medicamento no encontrado');
    if (!T.validDate(body.fecha) || !T.validTime(body.hora)) throw bad('fecha (YYYY-MM-DD) y hora (HH:MM) son obligatorias');
    if (!ESTADOS_TOMA.includes(body.estado)) throw bad(`estado debe ser uno de: ${ESTADOS_TOMA.join(', ')}`);
    if (body.fecha > T.addDays(n.date, 1)) throw bad('no se puede registrar una toma de más de un día adelante');
    if (body.fecha < T.addDays(n.date, -DIAS_ATRAS_TOMAS)) throw bad(`no se puede registrar una toma de hace más de ${DIAS_ATRAS_TOMAS} días`);
    if (!S.dosesFor([med], body.fecha).some((x) => x.hora === body.hora)) throw new HttpError(404, 'esa dosis no existe en el calendario del medicamento');
    let hasta = null;
    if (body.estado === 'pospuesta') {
      const min = body.minutos === undefined ? 10 : body.minutos;
      if (!Number.isInteger(min) || min < 5 || min > 180) throw bad('minutos debe ser un entero de 5 a 180');
      hasta = T.fromAbsMin(T.absMin(n.date, n.time) + min);
    }
    mutar(h, (x) => {
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
    const vista = S.dayView(d, body.fecha, n, (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN).find((x) => x.medicamentoId === med.id && x.hora === body.hora);
    return { toma: vista, existencias: d.medicamentos.find((y) => y.id === med.id).existencias ?? null };
  }

  ruta('POST', /^\/tomas$/, 'persona', ({ h, d, body }) => aplicarToma(h, d, body));

  /**
   * «Necesito ayuda»: guarda la ayuda en el hogar (alerta urgente para el círculo). Si ya hubo una en el último minuto,
   * devuelve esa misma (un doble toque o «auxilio, auxilio» no se duplica). La usan POST /ayuda, /voz y la conversación.
   */
  function pedirAyuda(h, d, mensajeCrudo) {
    const mensaje = texto(mensajeCrudo, 'mensaje', { max: 200 });
    const t = now().getTime();
    const n = ahora();
    const cuidadores = d.tokens.filter((x) => x.rol === 'cuidador').length;
    const publica = ({ id, fecha, hora, mensaje: msj }) => ({ id, fecha, hora, mensaje: msj });
    const ultima = (h.ayudas || []).at(-1);
    if (ultima && typeof ultima.ms === 'number' && t >= ultima.ms && t - ultima.ms < AYUDA_REPETIDA_MS) return { ayuda: publica(ultima), cuidadores, nueva: false };
    const a = { id: newId(), fecha: n.date, hora: n.time, mensaje, ms: t };
    mutar(h, (x) => {
      x.ayudas = [...(x.ayudas || []), a].slice(-MAX_AYUDAS);
    });
    return { ayuda: publica(a), cuidadores, nueva: true };
  }

  ruta('POST', /^\/ayuda$/, 'persona', ({ h, d, body, res }) => {
    const r = pedirAyuda(h, d, body.mensaje);
    res.status = r.nueva ? 201 : 200;
    return { ayuda: r.ayuda, cuidadores: r.cuidadores };
  });

  // Órdenes en español, por voz o por texto (la isla de Windows y el chat las envían aquí).
  function ejecutarOrden(h, d, texto) {
    const n = ahora();
    const tolerancia = (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN;
    const hoy = S.dayView(d, n.date, n, tolerancia);
    const abiertas = S.candidatas(d, n, tolerancia); // incluye la de las 23:50 si ya pasó la medianoche
    const dosis = abiertas.find((x) => X.requiereAtencion(x.estado)) || abiertas.find((x) => x.estado === 'pendiente' || x.estado === 'pospuesta');
    const c = interpretar(texto);
    const registrar = (estado, minutos) => aplicarToma(h, d, { medicamentoId: dosis.medicamentoId, fecha: dosis.fecha, hora: dosis.hora, estado, ...(minutos ? { minutos } : {}) });
    const sinToma = { reply: 'No tienes ninguna toma pendiente.', accion: { tipo: c.tipo, hecho: false } };
    switch (c.tipo) {
      case 'pedir-ayuda': {
        const r = pedirAyuda(h, d, texto.slice(0, 200));
        const reply = r.cuidadores ? 'Avisé a tus cuidadores. Si es una emergencia, llama al 911.' : 'Todavía no tienes cuidadores en tu círculo. Si es una emergencia, llama al 911.';
        return { reply, accion: { tipo: 'pedir-ayuda', hecho: true } };
      }
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
  }

  /** Las herramientas del modelo, atadas a un solo hogar: no hay forma de que vea o toque datos de otra persona. */
  function herramientas(h, d) {
    const n = ahora();
    const tol = (d.perfil && d.perfil.tolerancia) || S.TOLERANCIA_MIN;
    const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/\p{Mn}+/gu, '');
    return {
      consultar_hoy: async () => {
        const vista = S.dayView(d, n.date, n, tol);
        const prox = S.nextDose(d, n, tol);
        return { fecha: n.date, tomas: vista.map((x) => ({ medicina: x.nombre, dosis: x.dosis, hora: x.hora, estado: x.estado })), siguiente: prox ? { medicina: prox.nombre, dosis: prox.dosis, fecha: prox.fecha, hora: prox.hora } : null };
      },
      consultar_medicinas: async () => {
        const est = new Map(Rs.estimar(d, n, tol).map((r) => [r.id, r]));
        return { medicinas: d.medicamentos.filter((m) => m.activo !== false).map((m) => ({ nombre: m.nombre, dosis: m.dosis, horarios: m.horarios, instrucciones: m.instrucciones, quedan: m.existencias ?? null, alcanza_para_dias: est.has(m.id) ? est.get(m.id).diasRestantes : null, se_acaba: est.has(m.id) ? est.get(m.id).seAcaba : null })) };
      },
      consultar_citas: async () => ({ citas: R.proximasCitas(d, n).map((c) => ({ especialista: c.especialista, fecha: c.fecha, hora: c.hora, lugar: c.lugar, motivo: c.motivo })) }),
      consultar_mediciones: async ({ tipo, dias }) => {
        if (tipo && !M.TIPOS.includes(tipo)) throw bad('tipo no válido');
        const desde = T.addDays(n.date, -Math.min(365, Math.max(1, Number(dias) || 14)));
        return { mediciones: d.mediciones.filter((m) => m.fecha >= desde && (!tipo || m.tipo === tipo)).sort((a, b) => T.absMin(b.fecha, b.hora) - T.absMin(a.fecha, a.hora)).slice(0, 12).map((m) => ({ tipo: m.tipo, valor: M.describir(m.tipo, m.valor), fecha: m.fecha, hora: m.hora, aviso: (M.evaluar(m.tipo, m.valor, (d.perfil && d.perfil.rangos) || {}) || {}).texto || null })) };
      },
      consultar_convocatorias: async ({ solo_discapacidad }) => ({ convocatorias: d.convocatorias.items.filter((i) => !solo_discapacidad || i.discapacidad).slice(0, 20).map((i) => ({ nombre: i.nombre, dependencia: i.dependencia, para_discapacidad: !!i.discapacidad })), ultima_lectura: d.convocatorias.ultimaLectura }),
      registrar_toma: async ({ medicina, estado, minutos }) => {
        if (!['tomada', 'omitida', 'pospuesta'].includes(estado)) throw bad('estado no válido');
        let candidatas = S.candidatas(d, n, tol).filter((x) => X.requiereAtencion(x.estado) || x.estado === 'pendiente' || x.estado === 'pospuesta');
        if (medicina) candidatas = candidatas.filter((x) => norm(x.nombre).includes(norm(medicina)));
        const dosis = candidatas.find((x) => X.requiereAtencion(x.estado)) || candidatas[0];
        if (!dosis) throw bad(medicina ? `no hay una toma pendiente de ${medicina}` : 'no hay ninguna toma pendiente');
        aplicarToma(h, d, { medicamentoId: dosis.medicamentoId, fecha: dosis.fecha, hora: dosis.hora, estado, ...(minutos ? { minutos } : {}) });
        return { ok: true, medicina: dosis.nombre, hora: dosis.hora, estado };
      },
      crear_cita: async (entrada) => {
        const c = { id: newId(), ...validarCita({ especialista: entrada.especialista, fecha: entrada.fecha, hora: entrada.hora, lugar: entrada.lugar, motivo: entrada.motivo }, null) };
        if (T.absMin(c.fecha, c.hora) < T.absMin(n.date, n.time)) throw bad('esa fecha ya pasó: confirma con la persona el día y la hora');
        const igual = d.citas.find((x) => norm(x.especialista) === norm(c.especialista) && x.fecha === c.fecha && x.hora === c.hora);
        if (igual) return { ok: true, ya_existia: true, cita: { especialista: igual.especialista, fecha: igual.fecha, hora: igual.hora } };
        mutar(h, (x) => x.citas.push(c));
        return { ok: true, cita: { especialista: c.especialista, fecha: c.fecha, hora: c.hora } };
      },
      registrar_medicion: async (e) => {
        const valor = { presion: { sistolica: e.sistolica, diastolica: e.diastolica, ...(e.pulso !== undefined ? { pulso: e.pulso } : {}) }, glucosa: { mgdl: e.mgdl }, peso: { kg: e.kg }, animo: { nivel: e.nivel }, dolor: { nivel: e.nivel } }[e.tipo];
        const v = M.validar(e.tipo, valor);
        if (!v.ok) throw bad(v.error);
        const med = { id: newId(), tipo: e.tipo, valor: v.valor, nota: texto(e.nota, 'nota', { max: 200 }), fecha: n.date, hora: n.time };
        const repetida = d.mediciones.find((x) => x.tipo === med.tipo && x.fecha === med.fecha && JSON.stringify(x.valor) === JSON.stringify(med.valor) && Math.abs(T.absMin(x.fecha, x.hora) - T.absMin(med.fecha, med.hora)) <= 10);
        if (repetida) return { ok: true, ya_existia: true, registrado: M.describir(med.tipo, med.valor) };
        mutar(h, (x) => x.mediciones.push(med));
        const aviso = M.evaluar(med.tipo, med.valor, (d.perfil && d.perfil.rangos) || {});
        return { ok: true, registrado: M.describir(med.tipo, med.valor), aviso: aviso ? aviso.texto : null };
      },
      pedir_ayuda: async ({ mensaje }) => {
        const r = pedirAyuda(h, d, typeof mensaje === 'string' ? mensaje.trim().slice(0, 200) : '');
        return { ok: true, cuidadores: r.cuidadores, ...(r.nueva ? {} : { ya_existia: true }) };
      },
      agregar_medicina: async (e) => {
        const m = { id: newId(), ...validarMedicamento({ nombre: e.nombre, dosis: e.dosis, horarios: e.horarios, instrucciones: e.instrucciones }, null, n.date), creado: n.date };
        if (d.medicamentos.some((x) => x.activo !== false && norm(x.nombre) === norm(m.nombre))) return { ok: true, ya_existia: true, medicina: m.nombre };
        mutar(h, (x) => x.medicamentos.push(m));
        return { ok: true, medicina: m.nombre, horarios: m.horarios };
      }
    };
  }

  /** Conversa con el modelo; si no hay modelo, se acabó el cupo del día o falla, usa el intérprete de frases. */
  async function responder(h, d, auth, textoOrden) {
    const t = now().getTime();
    const llmFn = llm === undefined ? (process.env.ANTHROPIC_API_KEY ? Conv.anthropic(process.env.ANTHROPIC_API_KEY) : null) : llm;
    const palabras = textoOrden.split(/\s+/).filter(Boolean).length;
    const simple = interpretar(textoOrden).tipo !== 'desconocido' && palabras <= 5; // «qué sigue», «ya la tomé»: sin modelo, al instante
    const respaldo = () => {
      const r = ejecutarOrden(h, d, textoOrden);
      memoriaChat.guardar(auth.id, textoOrden, r.reply);
      return r;
    };
    if (!llmFn || simple) return respaldo();
    const hoy = ahora().date;
    const dia = chatsPorDia.get(auth.id);
    const usados = dia && dia.fecha === hoy ? dia.n : 0;
    if (usados >= MAX_CHATS_POR_DIA) return respaldo();
    chatsPorDia.set(auth.id, { fecha: hoy, n: usados + 1 });
    try {
      const n = ahora();
      const { reply, cambios } = await Conv.conversar({
        llm: llmFn, texto: textoOrden, historial: memoriaChat.leer(auth.id), herramientas: herramientas(h, d),
        contexto: { nombre: d.perfil && d.perfil.nombre, discapacidad: d.perfil && d.perfil.discapacidad, fecha: n.date, hora: n.time }
      });
      memoriaChat.guardar(auth.id, textoOrden, reply);
      return { reply, accion: { tipo: 'conversacion', hecho: cambios } };
    } catch (e) {
      console.error('[lazo] conversación:', e.message);
      return respaldo();
    }
  }

  ruta('POST', /^\/voz$/, 'persona', ({ h, d, auth, body }) => {
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
    if (!texto) throw bad('texto es obligatorio');
    if (texto.length > 300) throw bad('texto admite hasta 300 caracteres');
    return responder(h, d, auth, texto);
  });

  // Audio (m4a, ogg, wav…) → texto con Whisper → la misma orden que /voz. El audio no se guarda.
  ruta('POST', /^\/voz\/audio$/, 'persona', async ({ h, d, auth, audio, mime }) => {
    const t = now().getTime();
    const marcas = (audiosPorToken.get(auth.id) || []).filter((x) => t - x < 60000);
    if (marcas.length >= 12) throw new HttpError(429, 'demasiados audios seguidos: espera un momento');
    marcas.push(t);
    audiosPorToken.set(auth.id, marcas);
    const clave = process.env.GROQ_API_KEY;
    const transcribe = transcribir || (clave ? Tr.groq(clave) : null);
    if (!transcribe) throw new HttpError(503, 'el reconocimiento de voz no está configurado en este servidor');
    let texto;
    try {
      texto = (await transcribe(audio, mime)).trim();
    } catch (e) {
      console.error('[lazo] transcripción:', e.message);
      throw new HttpError(502, 'No pude entender el audio. Intenta de nuevo o escribe tu orden.');
    }
    if (!texto) return { transcripcion: '', reply: 'No te escuché. Acércate al micrófono e intenta de nuevo.', accion: { tipo: 'desconocido', hecho: false } };
    return { transcripcion: texto.slice(0, 300), ...(await responder(h, d, auth, texto.slice(0, 300))) };
  }, { crudo: true });

  ruta('POST', /^\/citas$/, 'persona', ({ h, d, body, res }) => {
    const c = { id: newId(), ...validarCita(body, null) };
    const igual = d.citas.find((x) => x.especialista.toLowerCase() === c.especialista.toLowerCase() && x.fecha === c.fecha && x.hora === c.hora);
    if (igual) return { cita: igual, repetida: true }; // doble toque: la misma cita no se agrega dos veces
    mutar(h, (x) => x.citas.push(c));
    res.status = 201;
    return { cita: c };
  });

  ruta('PATCH', /^\/citas\/([0-9a-f]{10})$/, 'persona', ({ h, d, body, m }) => {
    const previa = d.citas.find((x) => x.id === m[1]);
    if (!previa) throw new HttpError(404, 'cita no encontrada');
    const nueva = validarCita(body, previa);
    mutar(h, (x) => {
      x.citas[x.citas.indexOf(previa)] = nueva;
    });
    return { cita: nueva };
  });

  ruta('DELETE', /^\/citas\/([0-9a-f]{10})$/, 'persona', ({ h, d, m }) => {
    if (!d.citas.some((x) => x.id === m[1])) throw new HttpError(404, 'cita no encontrada');
    mutar(h, (x) => {
      x.citas = x.citas.filter((y) => y.id !== m[1]);
    });
    return { ok: true };
  });

  ruta('POST', /^\/mediciones$/, 'persona', ({ h, d, body, res }) => {
    const v = M.validar(body.tipo, body.valor);
    if (!v.ok) throw bad(v.error);
    const n = ahora();
    const fecha = body.fecha === undefined ? n.date : body.fecha;
    const hora = body.hora === undefined ? n.time : body.hora;
    if (!T.validDate(fecha) || !T.validTime(hora)) throw bad('fecha (YYYY-MM-DD) u hora (HH:MM) inválida');
    if (T.absMin(fecha, hora) > T.absMin(n.date, n.time) + 5) throw bad('la medición no puede ser del futuro: revisa la fecha y la hora');
    const med = { id: newId(), tipo: body.tipo, valor: v.valor, nota: texto(body.nota, 'nota', { max: 200 }), fecha, hora };
    // Un doble toque en «Guardar» manda lo mismo dos veces: la segunda (mismo dato, mismo momento) no crea otra medición.
    const repetida = d.mediciones.find((x) => x.tipo === med.tipo && x.fecha === med.fecha && JSON.stringify(x.valor) === JSON.stringify(med.valor) && Math.abs(T.absMin(x.fecha, x.hora) - T.absMin(med.fecha, med.hora)) <= 2);
    if (repetida) return { medicion: { ...repetida, texto: M.describir(repetida.tipo, repetida.valor) }, aviso: M.evaluar(repetida.tipo, repetida.valor, (d.perfil && d.perfil.rangos) || {}), repetida: true };
    mutar(h, (x) => x.mediciones.push(med));
    res.status = 201;
    return { medicion: { ...med, texto: M.describir(med.tipo, med.valor) }, aviso: M.evaluar(med.tipo, med.valor, (d.perfil && d.perfil.rangos) || {}) };
  });

  ruta('DELETE', /^\/mediciones\/([0-9a-f]{10})$/, 'persona', ({ h, d, m }) => {
    if (!d.mediciones.some((x) => x.id === m[1])) throw new HttpError(404, 'medición no encontrada');
    mutar(h, (x) => {
      x.mediciones = x.mediciones.filter((y) => y.id !== m[1]);
    });
    return { ok: true };
  });

  ruta('POST', /^\/circulo\/invitacion$/, 'persona', ({ h, res }) => {
    const t = now().getTime();
    const codigo = codigoNuevo(t);
    mutar(h, (x) => {
      x.invitaciones = x.invitaciones.filter((i) => !i.usada && i.expira > t).slice(-4); // máximo 5 códigos vigentes
      x.invitaciones.push({ codigo, expira: t + 24 * 3600 * 1000, usada: false });
    });
    res.status = 201;
    return { codigo, expira: new Date(t + 24 * 3600 * 1000).toISOString() };
  });

  ruta('POST', /^\/perfil\/vincular$/, 'persona', ({ h, res }) => {
    const t = now().getTime();
    const codigo = codigoNuevo(t);
    mutar(h, (x) => {
      x.invitaciones = x.invitaciones.filter((i) => !i.usada && i.expira > t).slice(-4);
      x.invitaciones.push({ codigo, expira: t + 24 * 3600 * 1000, usada: false, tipo: 'dispositivo' });
    });
    res.status = 201;
    return { codigo, expira: new Date(t + 24 * 3600 * 1000).toISOString() };
  });

  ruta('GET', /^\/dispositivos$/, 'persona', ({ h, d }) => ({ dispositivos: d.tokens.filter((t) => t.rol === 'persona').map(({ id, nombre, creado }) => ({ id, nombre, creado })) }));

  ruta('DELETE', /^\/dispositivos\/([0-9a-f]{10})$/, 'persona', ({ h, d, m, auth }) => {
    const t = d.tokens.find((x) => x.id === m[1] && x.rol === 'persona');
    if (!t) throw new HttpError(404, 'dispositivo no encontrado');
    if (t.id === auth.id) throw bad('no puedes quitar el acceso del dispositivo que estás usando');
    mutar(h, (x) => {
      x.tokens = x.tokens.filter((y) => y !== t);
      delete x.vistos[t.id];
    });
    return { ok: true };
  });

  ruta('GET', /^\/circulo$/, 'persona', ({ h, d }) => ({ cuidadores: d.tokens.filter((t) => t.rol === 'cuidador').map(({ id, nombre, parentesco, creado }) => ({ id, nombre, parentesco, creado })) }));

  ruta('DELETE', /^\/circulo\/([0-9a-f]{10})$/, 'persona', ({ h, d, m }) => {
    const t = d.tokens.find((x) => x.id === m[1] && x.rol === 'cuidador');
    if (!t) throw new HttpError(404, 'cuidador no encontrado');
    mutar(h, (x) => {
      x.tokens = x.tokens.filter((y) => y !== t);
      delete x.vistos[t.id];
    });
    return { ok: true };
  });

  ruta('POST', /^\/convocatorias\/actualizar$/, 'persona', async () => {
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

  async function leerCrudo(req) {
    const partes = [];
    let total = 0;
    for await (const c of req) {
      total += c.length;
      if (total > MAX_AUDIO) throw new HttpError(413, 'el audio es demasiado grande (máximo 10 MB)');
      partes.push(c);
    }
    return Buffer.concat(partes);
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
      let hogar = null;
      if (r.acceso !== 'publica') {
        const h = req.headers.authorization || '';
        const tk = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
        const hallado = tk ? buscarToken(tk) : null;
        if (!hallado) throw new HttpError(401, 'falta el token o no es válido');
        auth = hallado.tk;
        hogar = hallado.h;
        if (r.acceso === 'persona' && auth.rol !== 'persona') throw new HttpError(403, 'el cuidador solo puede consultar');
      }
      let body = {};
      let audio = null;
      let mime = '';
      if (r.crudo) {
        mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!MIMES_AUDIO.test(mime)) throw new HttpError(415, 'el cuerpo debe ser un audio (m4a, ogg, wav…)');
        if (Number(req.headers['content-length'] || 0) > MAX_AUDIO) throw new HttpError(413, 'el audio es demasiado grande (máximo 10 MB)');
        audio = await leerCrudo(req);
        if (audio.length < 1000) throw bad('el audio está vacío o es demasiado corto');
      } else if (req.method !== 'GET' && req.method !== 'DELETE') body = await leerCuerpo(req);
      const ctx = { audio, mime, h: hogar, d: hogar ? vista(hogar) : null, body, query: url.searchParams, auth, m: url.pathname.match(r.re), res: { status: 200 } };
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
