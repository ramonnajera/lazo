import { invoke } from "@tauri-apps/api/core";
import type { Cita, Convocatoria, ListaConvocatorias, Medicion, Toma, TomasDelDia, Estado } from "./types";

// El proxy de Rust añade el token y devuelve el JSON del servidor de Lazo; aquí se normaliza a los tipos de la UI.
// Cada llamada puede lanzar un ApiError ({kind, status?, message}).

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function request(method: string, path: string, body: unknown = null): Promise<Json> {
  return invoke<Json>("api_request", { method, path, body });
}

const orNull = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function toToma(o: Json): Toma {
  return {
    medicamentoId: str(o.medicamentoId),
    nombre: str(o.nombre),
    dosis: str(o.dosis),
    instrucciones: str(o.instrucciones),
    fecha: str(o.fecha),
    hora: str(o.hora),
    estado: (o.estado ?? "pendiente") as Estado,
    horaReal: orNull(o.horaReal),
    hasta: o.hasta ? { fecha: str(o.hasta.fecha), hora: str(o.hasta.hora) } : null,
  };
}

// --- Tomas de medicamentos ---
export async function getTomas(): Promise<TomasDelDia> {
  const r = await request("GET", "/tomas");
  return { fecha: str(r.fecha), ahora: { fecha: str(r.ahora?.fecha), hora: str(r.ahora?.hora) }, tomas: arr(r.tomas).map(toToma) };
}

/** Confirma, omite, pospone o deshace una toma. `minutos` solo aplica a «pospuesta». */
export function registrarToma(t: Pick<Toma, "medicamentoId" | "fecha" | "hora">, estado: Estado, minutos?: number) {
  return request("POST", "/tomas", { medicamentoId: t.medicamentoId, fecha: t.fecha, hora: t.hora, estado, ...(minutos ? { minutos } : {}) });
}

// --- Citas ---
export async function getCitas(): Promise<Cita[]> {
  return arr((await request("GET", "/citas")).citas).map((o) => ({
    id: str(o.id), especialista: str(o.especialista), motivo: str(o.motivo), lugar: str(o.lugar), fecha: str(o.fecha), hora: str(o.hora), notas: str(o.notas), transporte: str(o.transporte),
  }));
}

// --- Seguimiento ---
export async function getMediciones(): Promise<Medicion[]> {
  return arr((await request("GET", "/mediciones?dias=14")).mediciones).map((o) => ({
    id: str(o.id), tipo: str(o.tipo), texto: str(o.texto), nota: str(o.nota), fecha: str(o.fecha), hora: str(o.hora), aviso: o.aviso ? { nivel: str(o.aviso.nivel), texto: str(o.aviso.texto) } : null,
  }));
}

// --- Convocatorias de la Secretaría de Desarrollo Humano y Bien Común ---
export async function getConvocatorias(): Promise<ListaConvocatorias> {
  const r = await request("GET", "/convocatorias");
  const items: Convocatoria[] = arr(r.items).map((o) => ({
    id: str(o.id), nombre: str(o.nombre), dependencia: str(o.dependencia), documento: str(o.documento), ficha: orNull(o.ficha), tipoDocumento: str(o.tipoDocumento), discapacidad: o.discapacidad === true,
  }));
  return { items, ultimaLectura: orNull(r.ultimaLectura), error: orNull(r.error), nuevas: arr(r.nuevas) as unknown as string[] };
}
export const actualizarConvocatorias = () => request("POST", "/convocatorias/actualizar");

// --- Chat y voz: el servidor entiende la frase en español y contesta con `reply` ---
export async function sendMessage(texto: string): Promise<{ reply: string }> {
  return (await request("POST", "/voz", { texto })) as { reply: string };
}
