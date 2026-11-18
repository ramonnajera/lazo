import { useCallback, useEffect, useState } from "react";
import { cached, peekCached } from "../api/cache";
import type { ApiError } from "../api/types";
import { useConfig } from "../config/useConfig";

export interface PanelData<T> {
  data: T | null;
  fetchedAt: number | null;
  stale: boolean;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

type Snapshot<T> = Omit<PanelData<T>, "reload">;

interface Entry {
  state: Snapshot<unknown>;
  listeners: Set<(s: Snapshot<unknown>) => void>;
  fetcher: () => Promise<unknown>;
  timer: ReturnType<typeof setInterval> | undefined;
  inflight: Promise<void> | null;
  queued: boolean; // hay un refresco pedido mientras otro estaba en vuelo
  seq: number; // número de la última petición lanzada
  applied: number; // número de la última respuesta aplicada
}

// Un solo almacén por clave: un intervalo, una petición en vuelo y el mismo estado para todos.
const entries = new Map<string, Entry>();

function entryFor(key: string, fetcher: () => Promise<unknown>): Entry {
  let e = entries.get(key);
  if (!e) {
    const last = peekCached<unknown>(key);
    e = {
      state: { data: last?.data ?? null, fetchedAt: last?.fetchedAt ?? null, stale: false, error: null, loading: !last },
      listeners: new Set(),
      fetcher,
      timer: undefined,
      inflight: null,
      queued: false,
      seq: 0,
      applied: 0,
    };
    entries.set(key, e);
  }
  e.fetcher = fetcher;
  return e;
}

function publish(e: Entry, state: Snapshot<unknown>) {
  e.state = state;
  e.listeners.forEach((l) => l(state));
}

/** `force`: si ya hay una petición en vuelo, deja exactamente una nueva en cola para cuando termine. */
function load(key: string, e: Entry, force = false): void {
  if (e.inflight) {
    if (force) e.queued = true;
    return;
  }
  const id = ++e.seq;
  e.inflight = cached(key, () => e.fetcher())
    .then(
      (r) => {
        if (id >= e.applied) {
          e.applied = id;
          publish(e, { data: r.data, fetchedAt: r.fetchedAt, stale: r.stale, error: null, loading: false });
        }
      },
      (err) => {
        if (id >= e.applied) {
          e.applied = id;
          publish(e, { ...e.state, error: err as ApiError, loading: false });
        }
      },
    )
    .finally(() => {
      e.inflight = null;
      if (e.queued) {
        e.queued = false;
        load(key, e);
      }
    });
}

/**
 * Refresca ya los paneles con esas claves (p. ej. tras una mutación). Los no montados cargan al montarse.
 * Una clave también cubre las suyas con sufijo `clave:…` (el calendario guarda un mes por clave: `cal:2026-11`).
 */
export function refreshKeys(...keys: string[]): void {
  for (const [key, e] of entries) {
    if (e.listeners.size > 0 && keys.some((k) => key === k || key.startsWith(`${k}:`))) load(key, e, true);
  }
}

/** Refresca solo las claves montadas cuyos datos tienen más de `ms` (o aún no hay); no hace nada si hay petición en curso. */
export function refreshIfOlderThan(keys: string[], ms: number): void {
  const now = Date.now();
  for (const k of keys) {
    const e = entries.get(k);
    if (!e || e.listeners.size === 0 || e.inflight) continue;
    const at = e.state.fetchedAt;
    if (at === null || now - at > ms) load(k, e);
  }
}

/** Carga con caché; refresca cada `refreshSec` y al montarse. Todos los suscriptores de una clave comparten estado. */
export function usePanelData<T>(key: string, fetcher: () => Promise<T>): PanelData<T> {
  const { config } = useConfig();
  const refreshSec = config?.connection.refreshSec ?? 60;
  const [state, setState] = useState<Snapshot<T>>(() => entryFor(key, fetcher).state as Snapshot<T>);

  useEffect(() => {
    const e = entryFor(key, fetcher);
    const listener = (s: Snapshot<unknown>) => setState(s as Snapshot<T>);
    e.listeners.add(listener);
    setState(e.state as Snapshot<T>);
    if (e.listeners.size === 1) e.timer = setInterval(() => load(key, e), Math.max(5, refreshSec) * 1000);
    load(key, e);
    return () => {
      e.listeners.delete(listener);
      if (e.listeners.size === 0) {
        clearInterval(e.timer);
        e.timer = undefined;
      }
    };
    // fetcher se lee por entrada (siempre el último); solo cambian la clave y el intervalo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshSec]);

  const reload = useCallback(() => {
    const e = entries.get(key);
    if (e) load(key, e, true);
  }, [key]);

  return { ...state, reload };
}
