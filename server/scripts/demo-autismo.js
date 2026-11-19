// demo-autismo.js — carga la demostración «Mateo Ruiz» (joven autista, datos ficticios) en un perfil ya creado, por la API.
// Uso: node scripts/demo-autismo.js <token-de-la-persona> [url]   (url por omisión: http://127.0.0.1:18800)
// Las fechas son relativas al día de hoy en Chihuahua (UTC-6). Agrega datos: conviene correrlo sobre un perfil vacío.
const B = process.argv[3] || 'http://127.0.0.1:18800';
const TOK = process.argv[2];
const api = async (method, path, body, token = TOK) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); const j = t ? JSON.parse(t) : null;
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${t}`);
  return j;
};
const HOY = new Date(Date.now() - 6 * 3600 * 1000); // fecha local de Chihuahua
const dia = (n) => new Date(Date.UTC(HOY.getUTCFullYear(), HOY.getUTCMonth(), HOY.getUTCDate() + n)).toISOString().slice(0, 10);

(async () => {
  await api('PATCH', '/perfil', { nombre: 'Mateo Ruiz', discapacidad: 'otra', preferencias: { textoGrande: true, altoContraste: false, voz: true } });

  const med = async (b) => (await api('POST', '/medicamentos', { inicio: dia(-10), ...b })).medicamento;
  const risp = await med({ nombre: 'Risperidona', dosis: '0.5 mg', horarios: ['08:00', '20:00'], instrucciones: 'Con alimentos. Para la irritabilidad', existencias: 5 });
  const sert = await med({ nombre: 'Sertralina', dosis: '25 mg', horarios: ['09:00'], instrucciones: 'En el desayuno. Para la ansiedad', existencias: 24 });
  const mela = await med({ nombre: 'Melatonina', dosis: '3 mg', horarios: ['21:30'], instrucciones: '30 minutos antes de dormir, con luz baja', existencias: 40 });
  const omega = await med({ nombre: 'Omega 3', dosis: '1 cápsula', horarios: ['14:00'], dias: [1, 3, 5], instrucciones: 'Con la comida', existencias: 18 });

  // Historial de tomas de los últimos 9 días (casi todo tomado; un par omitidas, como en la vida real)
  const omitidas = new Set([`${risp.id}:${dia(-6)}:20:00`, `${mela.id}:${dia(-3)}:21:30`, `${sert.id}:${dia(-8)}:09:00`]);
  for (let n = -9; n <= 0; n++) {
    const f = dia(n);
    const dow = new Date(f + 'T12:00:00Z').getUTCDay();
    const dosis = [[risp, '08:00'], [sert, '09:00'], [risp, '20:00'], [mela, '21:30']];
    if ([1, 3, 5].includes(dow)) dosis.push([omega, '14:00']);
    for (const [m, h] of dosis) {
      if (n === 0 && h >= '20:00') continue; // hoy: la de las 8 pm y la melatonina quedan pendientes para el demo
      const estado = omitidas.has(`${m.id}:${f}:${h}`) ? 'omitida' : 'tomada';
      await api('POST', '/tomas', { medicamentoId: m.id, fecha: f, hora: h, estado });
    }
  }
  // Las existencias se descontaron al registrar las tomas: se ajustan a lo que muestra el demo
  await api('PATCH', `/medicamentos/${risp.id}`, { existencias: 5 });   // alcanza para ~2 días: aviso de resurtir
  await api('PATCH', `/medicamentos/${sert.id}`, { existencias: 24 });
  await api('PATCH', `/medicamentos/${mela.id}`, { existencias: 40 });
  await api('PATCH', `/medicamentos/${omega.id}`, { existencias: 18 });

  const cita = (b) => api('POST', '/citas', b);
  await cita({ especialista: 'Terapia ocupacional', motivo: 'Integración sensorial', lugar: 'Centro de Neurodesarrollo, sala 2', fecha: dia(1), hora: '10:00', transporte: 'Lo lleva su mamá', notas: 'Llevar audífonos de cancelación de ruido y su agenda visual' });
  await cita({ especialista: 'Terapia de lenguaje', motivo: 'Comunicación social y conversación', lugar: 'Centro de Neurodesarrollo, consultorio 5', fecha: dia(2), hora: '16:30', transporte: 'Camión ruta 3, con su hermano', notas: 'Avisarle un día antes: no le gustan los cambios de último minuto' });
  await cita({ especialista: 'Psiquiatría · Dra. Treviño', motivo: 'Control de risperidona', lugar: 'Hospital General, consultorio 12', fecha: dia(6), hora: '11:00', transporte: 'Taxi', notas: 'Llevar el registro de peso, glucosa y ánimo. Pedir el último turno: la sala se vacía' });
  await cita({ especialista: 'Laboratorio', motivo: 'Glucosa y perfil de lípidos en ayunas', lugar: 'Laboratorio del Hospital General', fecha: dia(14), hora: '07:30', transporte: 'Lo lleva su mamá', notas: '8 horas de ayuno. Explicarle el piquete con anticipación' });
  await cita({ especialista: 'Psicología', motivo: 'Terapia cognitivo-conductual: manejo de la ansiedad', lugar: 'Consultorio particular, Av. Universidad 1820', fecha: dia(17), hora: '17:00', transporte: 'Camión ruta 3', notas: '' });

  const m = (tipo, valor, n, hora, nota = '') => api('POST', '/mediciones', { tipo, valor, fecha: dia(n), hora, nota });
  await m('peso', { kg: 71.8 }, -9, '07:40', 'En ayunas');
  await m('glucosa', { mgdl: 92 }, -9, '07:45', 'En ayunas');
  await m('presion', { sistolica: 118, diastolica: 76, pulso: 74 }, -8, '19:00');
  await m('animo', { nivel: 4 }, -8, '21:00', 'Buen día en el taller');
  await m('animo', { nivel: 2 }, -6, '21:00', 'Cambio de rutina en el trabajo, mucho ruido');
  await m('dolor', { nivel: 3 }, -6, '21:05', 'Dolor de cabeza después de un día con mucho ruido');
  await m('animo', { nivel: 3 }, -5, '21:00', 'Durmió mal');
  await m('peso', { kg: 72.3 }, -4, '07:40', 'En ayunas');
  await m('glucosa', { mgdl: 98 }, -4, '07:45', 'En ayunas');
  await m('animo', { nivel: 4 }, -3, '21:00', 'Fue al parque con su hermano');
  await m('presion', { sistolica: 121, diastolica: 78, pulso: 70 }, -2, '19:00');
  await m('animo', { nivel: 5 }, -1, '21:00', 'Terminó su rompecabezas de 1000 piezas');
  await m('peso', { kg: 72.9 }, 0, '07:40', 'En ayunas: sube poco a poco, comentarlo en psiquiatría');
  await m('glucosa', { mgdl: 104 }, 0, '07:45', 'En ayunas');
  await m('animo', { nivel: 4 }, 0, '19:30', 'Tranquilo');

  // Una cuidadora en el círculo (su token se descarta: solo es para que el demo tenga a quién avisar)
  const { codigo } = await api('POST', '/circulo/invitacion');
  await api('POST', '/circulo/unirse', { codigo, nombre: 'Laura Ruiz', parentesco: 'Mamá' }, null);

  const r = await api('GET', '/tomas');
  console.log('listo:', (await api('GET', '/medicamentos')).medicamentos.length, 'medicinas,', (await api('GET', '/citas')).citas.length, 'citas,', (await api('GET', '/mediciones?dias=30')).mediciones.length, 'mediciones; hoy:', r.tomas.map((t) => `${t.hora} ${t.nombre} ${t.estado}`).join(' | '));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
