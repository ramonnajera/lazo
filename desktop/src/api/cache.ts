import type { ApiError } from "./types";

export interface Cached<T> {
  data: T;
  fetchedAt: number;
  stale: boolean;
}

const PREFIX = "lazo-cache:";

function read<T>(key: string): { data: T; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as { data: T; fetchedAt: number }) : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: { data: T; fetchedAt: number }) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* cuota llena o sin storage: se ignora */
  }
}

/** Último valor guardado para `key`, sin tocar la red. */
export function peekCached<T>(key: string): { data: T; fetchedAt: number } | null {
  return read<T>(key);
}

/** Ejecuta `fetcher`; si falla por `offline` devuelve lo último guardado (stale). */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
  try {
    const data = await fetcher();
    const fetchedAt = Date.now();
    write(key, { data, fetchedAt });
    return { data, fetchedAt, stale: false };
  } catch (e) {
    if ((e as Partial<ApiError> | null)?.kind === "offline") {
      const last = read<T>(key);
      if (last) return { data: last.data, fetchedAt: last.fetchedAt, stale: true };
    }
    throw e;
  }
}
