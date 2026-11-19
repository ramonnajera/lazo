// store.js — almacén JSON de un solo proceso: lee una vez, guarda de forma atómica (archivo temporal + rename)
// y deja el archivo solo para el dueño (0600): son datos de salud.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONVOCATORIAS_VACIAS = () => ({ items: [], nuevas: [], ultimaLectura: null, error: null, baseline: false });

/** Datos de un hogar: una persona con su perfil, sus dispositivos, sus cuidadores y todo su seguimiento. */
const hogarVacio = () => ({
  perfil: null,
  tokens: [], // { id, hash, rol: 'persona' | 'cuidador', nombre, parentesco, creado }
  invitaciones: [], // { codigo, expira (ms), usada, tipo? }
  medicamentos: [],
  tomas: [], // { medicamentoId, fecha, hora, estado, hasta?, registrado }
  citas: [],
  mediciones: [],
  ayudas: [], // { id, fecha, hora, mensaje, ms } — «Necesito ayuda» (las 100 más recientes)
  vistos: {} // { [tokenId]: [alertaId] }
});

/** Completa un hogar guardado por una versión anterior con los campos que le falten (p. ej. `ayudas`). */
const completarHogar = (h) => ({ ...hogarVacio(), ...h });

// Versión 2: varios hogares independientes en un mismo servidor; las convocatorias (públicas) se comparten.
const empty = () => ({ version: 2, hogares: {}, convocatorias: CONVOCATORIAS_VACIAS() });

/** Convierte el archivo de la versión 1 (una sola persona en la raíz) a la versión 2, sin perder nada. */
function migrar(viejo) {
  if (viejo && viejo.version === 2) {
    const hogares = {};
    for (const [id, h] of Object.entries(viejo.hogares || {})) hogares[id] = completarHogar(h);
    return { ...empty(), ...viejo, hogares };
  }
  const nuevo = empty();
  if (viejo && viejo.perfil) {
    const { convocatorias, version, ...resto } = viejo;
    nuevo.hogares[newId()] = completarHogar(resto);
    if (convocatorias) nuevo.convocatorias = convocatorias;
  } else if (viejo && viejo.convocatorias) {
    nuevo.convocatorias = viejo.convocatorias;
  }
  return nuevo;
}

class Store {
  constructor(file) {
    this.file = file;
    this.migrado = false;
    this.data = this.load();
    if (this.migrado) this.save(); // deja el archivo ya en la versión 2
  }

  load() {
    if (!this.file) return empty();
    try {
      const crudo = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const datos = migrar(crudo);
      this.migrado = !crudo || crudo.version !== 2;
      return datos;
    } catch (e) {
      if (e.code !== 'ENOENT') console.error(`[lazo] no pude leer ${this.file}: ${e.message}`);
      return empty();
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** Aplica un cambio y lo guarda. */
  mutate(fn) {
    const r = fn(this.data);
    this.save();
    return r;
  }
}

const newId = () => crypto.randomBytes(5).toString('hex');
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const newToken = () => `lzo_${crypto.randomBytes(24).toString('hex')}`;

module.exports = { Store, newId, hashToken, newToken, empty, hogarVacio };
