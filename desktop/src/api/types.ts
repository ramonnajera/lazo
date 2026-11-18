export type ApiErrorKind = "offline" | "unauthorized" | "http" | "no_token";

export interface ApiError {
  kind: ApiErrorKind;
  status?: number;
  message: string;
}

/** Estado de una toma de medicamento, tal como lo calcula el servidor de Lazo. */
export type Estado = "pendiente" | "ahora" | "atrasada" | "tomada" | "omitida" | "pospuesta";

export interface Toma {
  medicamentoId: string;
  nombre: string;
  dosis: string;
  instrucciones: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM
  estado: Estado;
  horaReal: string | null;
  hasta: { fecha: string; hora: string } | null;
}

export interface TomasDelDia {
  fecha: string;
  ahora: { fecha: string; hora: string };
  tomas: Toma[];
}

export interface Cita {
  id: string;
  especialista: string;
  motivo: string;
  lugar: string;
  fecha: string;
  hora: string;
  notas: string;
  transporte: string;
}

export interface Medicion {
  id: string;
  tipo: "presion" | "glucosa" | "peso" | "animo" | "dolor" | string;
  texto: string;
  nota: string;
  fecha: string;
  hora: string;
  aviso: { nivel: "media" | "alta" | string; texto: string } | null;
}

export interface Convocatoria {
  id: string;
  nombre: string;
  dependencia: string;
  documento: string;
  ficha: string | null;
  tipoDocumento: "pdf" | "imagen" | "web" | string;
  discapacidad: boolean;
}

export interface ListaConvocatorias {
  items: Convocatoria[];
  ultimaLectura: string | null;
  error: string | null;
  nuevas: string[];
}
