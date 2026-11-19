// transcribir.js — convierte un audio en texto con Whisper (Groq), igual que Alice. El audio no se guarda: se envía,
// se recibe el texto y se descarta. Sin la clave GROQ_API_KEY el servidor responde 503 y la app avisa.

const https = require('https');

const MODELO = 'whisper-large-v3-turbo';
const EXTENSIONES = { 'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/3gpp': '3gp' };

function cuerpoMultipart(boundary, audio, mime) {
  const campo = (n, v) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`);
  const ext = EXTENSIONES[mime] || 'm4a';
  return Buffer.concat([
    campo('model', MODELO),
    campo('language', 'es'),
    campo('response_format', 'json'),
    campo('temperature', '0'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="nota.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
}

/** Devuelve una función `(audio: Buffer, mime: string) => Promise<string>` que usa la clave dada. */
function groq(key, { timeoutMs = 30000 } = {}) {
  return (audio, mime) =>
    new Promise((resolve, reject) => {
      const boundary = `----lazo${Date.now().toString(16)}`;
      const cuerpo = cuerpoMultipart(boundary, audio, mime);
      const req = https.request(
        {
          hostname: 'api.groq.com',
          path: '/openai/v1/audio/transcriptions',
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': cuerpo.length },
          timeout: timeoutMs
        },
        (res) => {
          const partes = [];
          res.on('data', (c) => partes.push(c));
          res.on('end', () => {
            const texto = Buffer.concat(partes).toString('utf8');
            if (res.statusCode !== 200) return reject(new Error(`groq ${res.statusCode}: ${texto.slice(0, 160)}`));
            try {
              resolve(String(JSON.parse(texto).text || '').trim());
            } catch {
              reject(new Error('respuesta de transcripción no válida'));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('la transcripción tardó demasiado')));
      req.end(cuerpo);
    });
}

module.exports = { groq, cuerpoMultipart, MODELO };
