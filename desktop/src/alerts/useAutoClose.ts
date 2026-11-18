import { useEffect, useRef } from "react";

/** Una tarjeta de aviso se pliega sola tras este tiempo (ya cuenta como mostrada). */
export const ALERT_AUTO_CLOSE_MS = 60_000;

/**
 * Llama `onClose` cuando `key` lleva `ms` visible sin cambiar. `key` nulo (sin aviso, o el aviso
 * esperando a que termine la escucha) detiene la cuenta.
 */
export function useAutoClose(key: string | null, onClose: () => void, ms = ALERT_AUTO_CLOSE_MS) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (key === null) return;
    const t = window.setTimeout(() => cb.current(), ms);
    return () => window.clearTimeout(t);
  }, [key, ms]);
}
