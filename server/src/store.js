// store.js — almacén JSON de un solo proceso: lee una vez, guarda de forma atómica (archivo temporal + rename)
// y deja el archivo solo para el dueño (0600): son datos de salud.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const empty = () => ({
  perfil: null,
  tokens: [], // { id, hash, rol: 'persona' | 'cuidador', nombre, parentesco, creado }
  invitaciones: [], // { codigo, expira (ms), usada }
  medicamentos: [],
  tomas: [], // { medicamentoId, fecha, hora, estado, hasta?, registrado }
  citas: [],
  mediciones: [],
  vistos: {}, // { [tokenId]: [alertaId] }
  convocatorias: { items: [], nuevas: [], ultimaLectura: null, error: null, baseline: false }
});

class Store {
  constructor(file) {
    this.file = file;
    this.data = this.load();
  }

  load() {
    if (!this.file) return empty();
    try {
      return { ...empty(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
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

module.exports = { Store, newId, hashToken, newToken, empty };
