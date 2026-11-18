import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getTomas, registrarToma } from "../api/client";
import { useConfig } from "../config/useConfig";
import { refreshKeys, usePanelData } from "../panels/usePanelData";
import type { IslandEvent, View } from "../island/model";
import { hablar } from "../voice/habla";
import { dueAlerts, type Alert } from "./due";
import { useAutoClose } from "./useAutoClose";

const SNOOZE_MS = 10 * 60_000;
const TICK_MS = 15_000;
const STORE = "lazo.alerts.shown";

function loadShown(): Set<string> {
  try {
    const raw = localStorage.getItem(STORE);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveShown(s: Set<string>) {
  try {
    // Los ids llevan la fecha: solo se conservan los de hoy y de ayer.
    const keep = [...s].slice(-200);
    localStorage.setItem(STORE, JSON.stringify(keep));
  } catch {
    /* sin almacenamiento */
  }
}

const SNOOZE_STORE = "lazo.alerts.snoozed";
function loadSnoozed(): Map<string, Date> {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_STORE) ?? "[]") as [string, string][];
    return new Map(raw.map(([k, v]) => [k, new Date(v)] as [string, Date]).filter(([, d]) => !Number.isNaN(d.getTime())));
  } catch {
    return new Map();
  }
}
function saveSnoozed(m: Map<string, Date>) {
  try {
    const now = Date.now();
    localStorage.setItem(SNOOZE_STORE, JSON.stringify([...m].filter(([, d]) => d.getTime() > now).map(([k, d]) => [k, d.toISOString()])));
  } catch {
    /* sin almacenamiento */
  }
}

/** Vistas desde las que el aviso sale como tarjeta sola (en `open`/`form` se ve como banner). */
export const cardFrom = (v: View) => v === "hidden" || v === "bar" || v === "music";

/**
 * Salir de "alert" descarta el aviso (Esc, cerrar, alternar), salvo hacia la escucha (lo deja esperando)
 * o hacia una sección abierta (Ctrl+Alt+C: sigue como banner).
 */
export const dropsAlert = (was: View, now: View) => was === "alert" && now !== "alert" && now !== "listening" && now !== "open";

/** El aviso se ve de verdad: tarjeta (`alert`) o banner (`open`/`form`). Solo entonces corre el plegado de 60 s. */
export const alertVisibleIn = (v: View) => v === "alert" || v === "open" || v === "form";

export interface AlertsApi {
  /** Avisos que salieron a la vez: un evento, un pendiente o varios pendientes. */
  current: Alert[] | null;
  error: string | null;
  done: () => void;
  snooze: () => void;
  close: () => void;
}

/**
 * Consulta /today (almacén compartido "today"), calcula los avisos vencidos y los muestra en la isla.
 * Mientras se dicta (`listening`) el aviso espera; la escucha tiene prioridad.
 */
export function useAlerts(state: View, listening: boolean, dispatch: (e: IslandEvent) => void): AlertsApi {
  const { config } = useConfig();
  const { data } = usePanelData("tomas", getTomas);
  const [current, setCurrent] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = useRef<Set<string>>(loadShown());
  const snoozed = useRef<Map<string, Date>>(loadSnoozed());
  const [tick, setTick] = useState(0);
  const prev = useRef<View>(state);
  const busy = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const was = prev.current;
    prev.current = state;
    if (dropsAlert(was, state)) setCurrent(null);
  }, [state]);

  // Con la isla abierta el aviso sale como banner dentro de la vista; solo la escucha lo hace esperar.
  const canShow = state !== "listening" && !listening;
  // La tarjeta sale sola desde la isla escondida, la barra o la música; abierta, se ve como banner.
  const closed = cardFrom(state);

  useEffect(() => {
    if (!config || !data || !canShow || busy.current) return;
    let alive = true;
    // Aviso que quedó esperando a que terminara el dictado.
    if (current) {
      if (closed) dispatch({ type: "alert" });
      return;
    }
    const due = dueAlerts(data.tomas, new Date(), shown.current, snoozed.current);
    // Las tomas que coinciden en la hora se juntan en una tarjeta.
    const first = due[0];
    if (!first) return;
    const batch = due.filter((a) => a.at.getTime() === first.at.getTime());
    busy.current = true;
    const check = config.alerts.dndFullscreen ? invoke<boolean>("is_fullscreen_busy").catch(() => false) : Promise.resolve(false);
    check
      .then((full) => {
        if (!alive || full) return; // se reintenta en el siguiente ciclo
        batch.forEach((a) => shown.current.add(a.id));
        saveShown(shown.current);
        setError(null);
        setCurrent(batch);
        hablar(batch.length > 1 ? `Es hora de tus medicinas: ${batch.map((a) => a.title).join(", ")}.` : `Es hora de ${batch[0].title}${batch[0].detail ? `, ${batch[0].detail}` : ""}.`);
        if (closed) dispatch({ type: "alert" });
      })
      .finally(() => {
        busy.current = false;
      });
    return () => {
      alive = false;
    };
  }, [config, data, canShow, closed, current, tick, dispatch]);

  const close = useCallback(() => {
    setCurrent(null);
    setError(null);
    dispatch({ type: "dismiss" });
  }, [dispatch]);

  const snooze = useCallback(() => {
    if (current) {
      const until = new Date(Date.now() + SNOOZE_MS);
      for (const a of current) {
        shown.current.delete(a.id);
        snoozed.current.set(a.id, until);
        // El servidor (y el cuidador) también se enteran de que se pospuso
        registrarToma(a.toma, "pospuesta", 10).then(() => refreshKeys("tomas")).catch(() => {});
      }
      saveShown(shown.current);
      saveSnoozed(snoozed.current);
    }
    close();
  }, [current, close]);

  const done = useCallback(() => {
    if (!current) return close();
    Promise.all(current.map((a) => registrarToma(a.toma, "tomada"))).then(
      () => {
        refreshKeys("tomas");
        hablar("Listo, registrado.");
        close();
      },
      () => setError("No se pudo registrar. Reintenta."),
    );
  }, [current, close]);

  // Nadie la atiende: tras 60 s visible se pliega sola (ya quedó contada como mostrada). Si aún no se ve
  // (p. ej. la isla en pausa ignoró el "alert"), la cuenta no empieza.
  useAutoClose(current && canShow && alertVisibleIn(state) ? current.map((a) => a.id).join("|") : null, close);

  return { current, error, done, snooze, close };
}
