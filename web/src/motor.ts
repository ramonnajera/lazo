// motor.ts — el «servidor» de la demo vive en tu navegador: los datos de Mateo se guardan en localStorage y viajan
// en cada petición a /api/lazo, que corre el servidor real de Lazo en memoria y devuelve los datos actualizados.
import type { ApiError } from "@isla/api/types";

const CLAVE = "lazo.demo.v1";
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Guardado {
  dia: string;
  estado: Json | null;
  chat: Json[];
}

/** Fecha de hoy en Chihuahua (UTC-6), la misma que usa el servidor. */
const hoyMx = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);

function leer(): Guardado {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || "null") as Guardado | null;
    // Los datos de Mateo se escriben relativos a «hoy»: si cambió el día, se siembran de nuevo.
    if (g && g.dia === hoyMx()) return g;
  } catch {
    /* sin almacenamiento o datos rotos */
  }
  return { dia: hoyMx(), estado: null, chat: [] };
}

let g = leer();
function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(g));
  } catch {
    /* modo privado: la demo funciona igual, solo no recuerda al recargar */
  }
}

// Una petición a la vez: cada respuesta trae el estado nuevo y la siguiente parte de él.
let cola: Promise<unknown> = Promise.resolve();

export function peticion(method: string, path: string, body: unknown = null, audio?: { b64: string; mime: string }): Promise<Json> {
  const p = cola.then(async () => {
    let r: Response;
    try {
      r = await fetch("/api/lazo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: g.estado, chat: g.chat, peticion: { method, path, body: body ?? undefined, ...(audio ? { audio: audio.b64, mime: audio.mime } : {}) } }),
      });
    } catch {
      throw { kind: "offline", message: "Sin conexión" } satisfies ApiError;
    }
    const j = (await r.json().catch(() => null)) as Json | null;
    if (!r.ok || !j) throw { kind: "http", status: r.status, message: j?.error ?? "La demo no respondió" } satisfies ApiError;
    if (j.estado) g = { dia: hoyMx(), estado: j.estado, chat: Array.isArray(j.chat) ? j.chat : g.chat };
    guardar();
    if (j.status >= 400) throw { kind: "http", status: j.status, message: j.json?.error ?? "error" } satisfies ApiError;
    return j.json as Json;
  });
  cola = p.catch(() => {});
  return p;
}

/** Borra la copia de Mateo de este navegador: la siguiente petición la siembra de nuevo. */
export function reiniciar() {
  g = { dia: hoyMx(), estado: null, chat: [] };
  guardar();
}

export const nombrePersona = () => (g.estado?.perfil?.nombre as string | undefined) ?? "Mateo Ruiz";
