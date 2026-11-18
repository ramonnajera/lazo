// Genera los tonos propios de la isla en public/sounds/{start,stop,error}.wav.
// Uso: node scripts/gen-sounds.mjs   (PCM 16 bits mono, 22 050 Hz; sin assets de terceros)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");

/** Una nota senoidal con su segundo armónico suave y envolvente ataque/caída. */
function note(freq, ms, gain = 0.32) {
  const n = Math.round((RATE * ms) / 1000);
  const attack = Math.round(RATE * 0.006);
  return Float32Array.from({ length: n }, (_, i) => {
    const t = i / RATE;
    const env = Math.min(1, i / attack) * Math.exp((-4 * i) / n);
    return gain * env * (Math.sin(2 * Math.PI * freq * t) + 0.18 * Math.sin(4 * Math.PI * freq * t));
  });
}

const silence = (ms) => new Float32Array(Math.round((RATE * ms) / 1000));

function concat(parts) {
  const all = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return all;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const sounds = {
  // Sube: empieza a escuchar.
  start: concat([note(660, 70), note(990, 110)]),
  // Baja: dejó de escuchar.
  stop: concat([note(990, 70), note(660, 110)]),
  // Dos golpes graves.
  error: concat([note(311, 110, 0.36), silence(40), note(233, 170, 0.36)]),
};

mkdirSync(out, { recursive: true });
for (const [name, s] of Object.entries(sounds)) {
  writeFileSync(join(out, `${name}.wav`), wav(s));
  console.log(`${name}.wav  ${(s.length / RATE).toFixed(2)} s`);
}
