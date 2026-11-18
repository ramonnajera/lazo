#!/usr/bin/env node
// index.js — arranca el servidor de Lazo.
//   LAZO_PORT (18800) · LAZO_HOST (127.0.0.1; usa 0.0.0.0 o la IP de Tailscale para abrirlo a tus dispositivos)
//   LAZO_DATA (./data/lazo.json)

const http = require('http');
const path = require('path');
const { createApp } = require('./app');

const PORT = Number(process.env.LAZO_PORT || 18800);
const HOST = process.env.LAZO_HOST || '127.0.0.1';
const DATA = process.env.LAZO_DATA || path.join(__dirname, '..', 'data', 'lazo.json');

const app = createApp({ dataFile: DATA });
const server = http.createServer(app.handler);
server.listen(PORT, HOST, () => console.log(`[lazo] escuchando en http://${HOST}:${PORT} (datos: ${DATA})`));

// Convocatorias: se leen al arrancar (si tienen más de 12 horas) y cada 6 horas.
const C = require('./convocatorias');
const T = require('./time');
const leer = () => C.actualizar(app.store, { now: T.local() }).then((r) => console.log('[lazo] convocatorias:', JSON.stringify(r)));
const ultima = app.store.data.convocatorias.ultimaLectura;
if (!ultima || Date.now() - Date.parse(ultima) > 12 * 3600 * 1000) setTimeout(leer, 5000);
setInterval(leer, 6 * 3600 * 1000).unref();

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
