#!/usr/bin/env node
// demo.js — arranca un servidor de demostración con una persona y datos FICTICIOS, con horas relativas al momento actual
// (así, al grabar el video, siempre hay una toma «que toca ahora»).
//   LAZO_PORT (18800) · LAZO_HOST (127.0.0.1) · LAZO_DATA (archivo temporal nuevo en cada arranque)

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../src/app');
const T = require('../src/time');

const PORT = Number(process.env.LAZO_PORT || 18800);
const HOST = process.env.LAZO_HOST || '127.0.0.1';
const DATA = process.env.LAZO_DATA || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lazo-demo-')), 'lazo.json');

const hhmm = (minutos) => {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

async function sembrar(base) {
  const llamar = async (metodo, ruta, cuerpo, token) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const t = await r.text();
    if (!r.ok) throw new Error(`${metodo} ${ruta}: ${r.status} ${t}`);
    return t ? JSON.parse(t) : {};
  };
  const ahora = T.local();
  const { token } = await llamar('POST', '/perfil', { nombre: 'Ana Ejemplo', discapacidad: 'ambas', preferencias: { textoGrande: true, altoContraste: false, voz: true } });
  const yo = (m, r, c) => llamar(m, r, c, token);

  // Una toma que toca ahora (5 min antes), otra dentro de 90 min y una diaria por la mañana
  await yo('POST', '/medicamentos', { nombre: 'Metformina', dosis: '850 mg', instrucciones: 'Con alimentos', horarios: [hhmm(ahora.minutes - 5), '08:00'], existencias: 12 });
  await yo('POST', '/medicamentos', { nombre: 'Losartán', dosis: '50 mg', horarios: [hhmm(ahora.minutes + 90)], existencias: 2 });
  await yo('POST', '/medicamentos', { nombre: 'Vitamina D', dosis: '1 cápsula', horarios: ['09:00'], dias: [1, 3, 5] });

  await yo('POST', '/citas', { especialista: 'Oftalmología', motivo: 'Revisión de la vista', lugar: 'Hospital General, consultorio 4', fecha: T.addDays(ahora.date, 1), hora: '09:30', transporte: 'Taxi adaptado', notas: 'Llevar estudios anteriores' });
  await yo('POST', '/citas', { especialista: 'Medicina interna', lugar: 'Centro de salud', fecha: T.addDays(ahora.date, 9), hora: '16:00' });

  await yo('POST', '/mediciones', { tipo: 'presion', valor: { sistolica: 128, diastolica: 82, pulso: 74 }, fecha: T.addDays(ahora.date, -1), hora: '08:10' });
  await yo('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 105 }, fecha: T.addDays(ahora.date, -1), hora: '08:15', nota: 'en ayunas' });
  await yo('POST', '/mediciones', { tipo: 'glucosa', valor: { mgdl: 245 }, hora: hhmm(ahora.minutes - 20), nota: 'después de comer' });
  await yo('POST', '/mediciones', { tipo: 'animo', valor: { nivel: 4 } });
  await yo('POST', '/mediciones', { tipo: 'dolor', valor: { nivel: 2 }, nota: 'rodilla' });

  const { codigo } = await yo('POST', '/circulo/invitacion');
  let convocatorias = 'sin conexión: se leerán al abrir «Apoyos»';
  try {
    const r = await yo('POST', '/convocatorias/actualizar');
    convocatorias = r.ok ? `${r.total} convocatorias leídas de la página oficial` : `no se pudo leer: ${r.error}`;
  } catch (e) { convocatorias = `no se pudo leer: ${e.message}`; }
  return { token, codigo, convocatorias };
}

const app = createApp({ dataFile: DATA });
const servidor = http.createServer(app.handler);
servidor.listen(PORT, HOST, async () => {
  const base = `http://${HOST}:${PORT}`;
  try {
    const { token, codigo, convocatorias } = await sembrar(base);
    console.log(`\nLazo (DEMOSTRACIÓN con datos ficticios) en ${base}\n`);
    console.log(`  Persona:      Ana Ejemplo`);
    console.log(`  Token:        ${token}`);
    console.log(`  Código de cuidador (24 h, un solo uso): ${codigo}`);
    console.log(`  Convocatorias: ${convocatorias}`);
    console.log(`  Datos:        ${DATA}\n`);
    console.log('  En la app o en la isla de escritorio: pega la dirección y el token (persona) o el código (cuidador).');
    console.log('  Ctrl+C para detener.\n');
  } catch (e) {
    console.error('No pude preparar la demostración:', e.message);
    process.exit(1);
  }
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => servidor.close(() => process.exit(0)));
