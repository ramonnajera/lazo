import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getTomas } from "../api/client";
import { useAlerts } from "../alerts/useAlerts";
import { useConfig } from "../config/useConfig";
import { ALL_PANELS } from "../panels/Chat";
import { ingestListen } from "../panels/chatStore";
import { hablar } from "../voice/habla";
import { refreshIfOlderThan, refreshKeys, usePanelData } from "../panels/usePanelData";
import AlertCard from "./AlertCard";
import Bar from "./Bar";
import Listening from "./Listening";
import { fromPowerConfirm, holdMs, isActive, nextListen, soundFor, type ListenState, type PowerConfirm, type Sound } from "./listen";
import { growRegion, INITIAL_MODEL, rectKey, reduce, regionFor, stripFor, type IslandEvent, type IslandModel, type IslandOpts, type Region, type Section, type View } from "./model";
import Sections from "./Sections";

function play(sound: Sound) {
  const a = new Audio(`/sounds/${sound}.wav`);
  a.volume = 0.6;
  a.play().catch(() => {});
}

/** Marcas de rendimiento: en debug siempre; en release solo con LAZO_PERF=1 (se anotan en %TEMP%\lazo-perf.log). */
let DEBUG = import.meta.env.DEV;
let PERF_FILE = false;
invoke<string>("perf_enabled")
  .then((mode) => {
    if (mode) {
      DEBUG = true;
      PERF_FILE = true;
    }
  })
  .catch(() => {});
function perfLog(line: string) {
  console.log(line);
  if (PERF_FILE) invoke("perf_log", { line }).catch(() => {});
}

/** Traza: de `performance.mark(name)` hasta pintar el cuadro con el cambio (solo en debug). */
function tracePaint(name: string) {
  if (!DEBUG) return;
  // El cuadro se pinta tras el rAF; el setTimeout corre justo después de pintarlo.
  requestAnimationFrame(() =>
    setTimeout(() => {
      try {
        const m = performance.measure(`${name}→paint`, name);
        perfLog(`[isla] ${name} → pintado: ${m.duration.toFixed(1)} ms`);
      } catch {
        /* sin marca */
      }
    }),
  );
}

const sameRegion = (a: Region | null, b: Region) => !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
/** Un campo de texto dentro de `root` tiene el foco (y la ventana también). */
export function typingIn(root: HTMLElement | null): boolean {
  if (!root || !document.hasFocus()) return false;
  const a = document.activeElement as HTMLElement | null;
  if (!a || !root.contains(a)) return false;
  if (a.tagName === "TEXTAREA" || a.isContentEditable) return true;
  return a.tagName === "INPUT" && !NOT_TEXT.has((a as HTMLInputElement).type);
}

export default function Island() {
  const { config } = useConfig();
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  /** El cursor está dentro de la ventana (es decir, dentro de la región visible). */
  const hoverRef = useRef(false);
  const soundsRef = useRef(true);
  soundsRef.current = config?.general.sounds ?? true;
  const [listenState, setListenState] = useState<ListenState | null>(null);
  const listenRef = useRef<ListenState | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const opts = useCallback((): IslandOpts => ({ hovering: hoverRef.current, paused: pausedRef.current, typing: typingIn(boxRef.current) }), []);
  const [model, dispatch] = useReducer((m: IslandModel, e: IslandEvent) => reduce(m, e, opts()), INITIAL_MODEL);
  const { view, section, prev } = model;
  const modelRef = useRef(model);
  modelRef.current = model;
  const viewRef = useRef(view);
  viewRef.current = view;
  /** Marca pendiente de medir cuando React confirme el cambio. */
  const traceRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (traceRef.current && DEBUG) {
      try {
        // Trabajo de JS hasta que React confirma el cambio (sin esperar al cuadro).
        perfLog(`[isla] ${traceRef.current} → confirmado: ${performance.measure(`${traceRef.current}→commit`, traceRef.current).duration.toFixed(1)} ms`);
      } catch {
        /* sin marca */
      }
    }
    if (traceRef.current) tracePaint(traceRef.current);
    traceRef.current = null;
  }, [view, section]);

  // ---- Región: sigue al rectángulo real del contenedor, una llamada por cambio.
  const sentRef = useRef<Region | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** Ancho de la barra sola (medido aunque esté escondida): la franja escondida mide lo mismo. */
  const barW = useRef<number | null>(null);
  /** Último rectángulo medido por vista (la abierta, por sección), para adelantar la región al crecer. */
  const lastRect = useRef<Partial<Record<string, { w: number; h: number }>>>({});
  /** La píldora se dibuja encima de una sección o formulario (no es la píldora sola). */
  const overlayRef = useRef(false);

  const send = useCallback((region: Region, why: string) => {
    if (sameRegion(sentRef.current, region)) return;
    sentRef.current = region;
    const t0 = performance.now();
    invoke("set_island_region", { ...region })
      .then(() => {
        if (!DEBUG) return;
        const since = why === "hover" ? ` (desde el hover: ${performance.measure("hover→region", "hover").duration.toFixed(1)} ms)` : "";
        perfLog(`[isla] región ${why} ${region.w}×${region.h} @${region.x} en ${(performance.now() - t0).toFixed(1)} ms${since}`);
      })
      .catch(() => {});
  }, []);

  /**
   * Todo evento que cambia la vista pasa por aquí: si la vista nueva es más grande, la región prevista
   * se aplica antes de confirmar (el primer cuadro no sale recortado). Si el reductor no cambia la
   * vista (p. ej. en pausa), la región no se toca.
   */
  const go = useCallback(
    (e: IslandEvent) => {
      const r = growRegion(modelRef.current, e, opts(), {
        known: lastRect.current,
        barW: barW.current,
        sent: sentRef.current,
        winW: window.innerWidth,
      });
      if (r) send(r, e.type === "hover" ? "hover" : `${e.type} (prevista)`);
      dispatch(e);
    },
    [send, opts],
  );

  // En el recorrido de medición los avisos reales no se mezclan con el simulado.
  const alertGo = useCallback((e: IslandEvent) => {
    go(e);
  }, [go]);
  const alerts = useAlerts(view, isActive(listenState), alertGo);
  const curAlerts = alerts.current;

  // Datos de la barra: almacenes compartidos con avisos y secciones (sin peticiones extra).
  const tomas = usePanelData("tomas", getTomas);

  // ---- Foco: solo al hacer clic (o por teclado/bandeja); se devuelve al esconderse.
  const wantFocus = useRef(false);
  /** Ctrl+Alt+C pendiente: enfocar el campo del chat cuando se confirme la vista. */
  const chatFocus = useRef(false);
  const focusChatInput = useCallback(() => {
    boxRef.current?.querySelector<HTMLInputElement>(".chat-input input")?.focus();
  }, []);
  useEffect(() => {
    if (!chatFocus.current) return;
    chatFocus.current = false;
    if (view === "open" && section === "chat") focusChatInput();
  }, [view, section, focusChatInput]);
  useEffect(() => {
    if (view === "hidden") invoke("restore_focus").catch(() => {});
    else if (wantFocus.current) invoke("focus_island").catch(() => {});
  }, [view]);
  // Vale solo para el render que provocó: nunca queda pendiente para un cambio posterior.
  useEffect(() => {
    wantFocus.current = false;
  });
  const onMouseDown = () => {
    if (!document.hasFocus()) invoke("focus_island").catch(() => {});
  };
  /** Acciones de teclado/bandeja: sin foco Esc no llegaría a la isla. Solo si cambian la vista. */
  const keyboard = useCallback((e: IslandEvent) => {
    const cur = modelRef.current;
    const next = reduce(cur, e, opts());
    if (next.view !== cur.view && next.view !== "hidden") wantFocus.current = true;
    go(e);
  }, [go, opts]);

  const sync = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const v = viewRef.current;
    const r = el.getBoundingClientRect();
    // Borde izquierdo medido (no supuesto): la región coincide con lo que se dibuja aunque la ventana no mida 400.
    const x = Math.floor(r.left);
    const rect = { x, w: Math.ceil(r.right - x), h: Math.ceil(r.height) };
    // Dictando sobre una sección o un formulario, el rectángulo es el de la tarjeta, no el de la píldora.
    if (v !== "hidden" && !(v === "listening" && overlayRef.current)) lastRect.current[rectKey(v, modelRef.current.section)] = { w: rect.w, h: rect.h };
    send(regionFor(v, v === "hidden" ? null : rect, barW.current, window.innerWidth), v);
    // El cursor quedó fuera de lo visible (p. ej. la barra se angostó bajo él): se esconde.
    const p = pointer.current;
    if ((v === "bar" || v === "music") && p && hoverRef.current && r.width > 0 && (p.x < r.left || p.x > r.right || p.y > r.bottom)) {
      hoverRef.current = false;
      go({ type: "leave" });
    }
  }, [send, go]);
  useLayoutEffect(sync, [view, sync]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);
  const onBarWidth = useCallback(
    (w: number) => {
      barW.current = w;
      lastRect.current.bar = { w, h: 36 };
      if (viewRef.current === "hidden") sync();
    },
    [sync],
  );

  // ---- Hover: entrar al documento muestra la barra; salir del contenedor la esconde (sin retardo).
  useEffect(() => {
    const root = document.documentElement;
    /** Solo dentro de la franja vigente (= ancho de la barra actual): evita abrir y cerrar en bucle. */
    const inStrip = (x: number) => {
      const s = stripFor(barW.current, window.innerWidth);
      return x >= s.x && x <= s.x + s.w;
    };
    const hover = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      // En pausa el hover no hace nada: sin IPC ni refrescos en cada movimiento.
      if (pausedRef.current || viewRef.current !== "hidden" || !inStrip(e.clientX)) return;
      hoverRef.current = true;
      // Si luego se hace clic, la isla debe saber a qué ventana devolver el foco.
      invoke("remember_foreground").catch(() => {});
      // Datos con más de 15 s: se refrescan al mostrar la barra (la isla escondida no sondea a menudo).
      refreshIfOlderThan(["tomas", "citas", "mediciones", "convocatorias"], 15_000);
      if (DEBUG) {
        performance.mark("hover");
        traceRef.current = "hover";
      }
      go({ type: "hover" });
    };
    const enter = (e: MouseEvent) => {
      hoverRef.current = true;
      hover(e);
    };
    const move = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (viewRef.current === "hidden") hover(e);
      else hoverRef.current = true;
    };
    const leave = () => {
      hoverRef.current = false;
      go({ type: "leave" });
    };
    // Escribiendo, sacar el ratón no la esconde; hacer clic en otra ventana sí (ya sin foco, sin `typing`).
    const blur = () => {
      if (!hoverRef.current) go({ type: "leave" });
    };
    root.addEventListener("mouseenter", enter);
    root.addEventListener("mousemove", move);
    root.addEventListener("mouseleave", leave);
    window.addEventListener("blur", blur);
    return () => {
      root.removeEventListener("mouseenter", enter);
      root.removeEventListener("mousemove", move);
      root.removeEventListener("mouseleave", leave);
      window.removeEventListener("blur", blur);
    };
  }, [go]);
  const onContainerLeave = () => {
    hoverRef.current = false;
    go({ type: "leave" });
  };

  // ---- Bandeja, pausa y atajos globales.
  useEffect(() => {
    invoke<boolean>("get_paused")
      .then((p) => {
        pausedRef.current = p;
        setPaused(p);
      })
      .catch(() => {});
    const subs = [
      listen<string>("tray", (e) => e.payload === "open" && keyboard({ type: "open" })),
      listen<boolean>("paused-changed", (e) => {
        pausedRef.current = e.payload;
        setPaused(e.payload);
        // Pausada: se cierra todo (formulario → abierta → escondida).
        if (e.payload) {
          go({ type: "escape" });
          go({ type: "escape" });
        }
      }),
    ];
    return () => subs.forEach((p) => p.then((u) => u()));
  }, [keyboard, go]);

  const apply = useCallback((s: ListenState) => {
    const before = listenRef.current;
    const next = nextListen(before, s);
    if (next === before) return;
    const sound = next && soundFor(before, next);
    if (sound && soundsRef.current) play(sound);
    listenRef.current = next;
    setListenState(next);
    if (next && next.phase !== "done") {
      // Empieza a dictar con la isla enfocada (clic en la barra, música o una sección, sin un campo de
      // texto activo): el foco vuelve a la app del usuario para que el texto se pegue allí. En un
      // formulario o en el campo del chat se queda (el texto va a ese campo).
      const v = modelRef.current.view;
      if ((v === "bar" || v === "music" || v === "open") && document.hasFocus() && !typingIn(boxRef.current)) {
        invoke("restore_focus").catch(() => {});
      }
      go({ type: "listenStart" });
    }
  }, [go]);

  const endListen = useCallback(() => {
    listenRef.current = null;
    setListenState(null);
    // Puede volver a una vista más grande (p. ej. música con el ratón encima).
    go({ type: "listenEnd" });
  }, [go]);

  useEffect(() => {
    const subs = [
      listen<string>("hotkey", (e) => {
        if (e.payload === "toggle") keyboard({ type: "toggle" });
        else if (e.payload === "chat") {
          const cur = modelRef.current;
          keyboard({ type: "openChat" });
          // Ctrl+Alt+C deja el cursor en el campo del chat.
          if (cur.view === "open" && cur.section === "chat") {
            invoke("focus_island").catch(() => {});
            focusChatInput();
          } else chatFocus.current = true;
        }
      }),
      listen<ListenState>("listen-state", (e) => {
        // El chat guarda la respuesta aunque la isla ya muestre otra sesión.
        if (ingestListen(e.payload)) refreshKeys(...ALL_PANELS);
        // Lo que Lazo contesta también se lee en voz alta (con las voces de Windows, sin internet).
        if (e.payload.reply && e.payload.text) hablar(e.payload.text);
        apply(e.payload);
      }),
      listen<PowerConfirm>("power-confirm", (e) => apply(fromPowerConfirm(e.payload))),
    ];
    return () => subs.forEach((p) => p.then((u) => u()));
  }, [keyboard, apply, focusChatInput]);

  // Texto final 3 s, respuesta de Lazo 8 s, error 6 s; luego vuelve a la vista anterior.
  useEffect(() => {
    if (!listenState) return;
    const ms = holdMs(listenState);
    if (ms === null) return;
    const t = window.setTimeout(() => {
      if (listenState.phase === "confirm") invoke("cancel_power").catch(() => {});
      endListen();
    }, ms);
    return () => window.clearTimeout(t);
  }, [listenState?.id, listenState?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConfirm = useCallback(
    (accept: boolean) => {
      const s = listenRef.current;
      if (!s || s.phase !== "confirm") return;
      if (!accept) {
        invoke("cancel_power").catch(() => {});
        return endListen();
      }
      invoke<string>("confirm_power", { cmd: s.confirm })
        .then((text) => apply({ id: s.id, mode: "lazo", phase: "done", text }))
        .catch((err) => apply({ id: s.id, mode: "lazo", phase: "error", text: String(err) }));
    },
    [apply, endListen],
  );

  // Clic en la respuesta de Lazo: abre el chat.
  const openReply = (e: React.MouseEvent) => {
    if (!listenState?.reply) return;
    e.stopPropagation();
    endListen();
    wantFocus.current = true;
    go({ type: "openChat" });
  };

  // Esc: formulario → abierta → escondida. Ctrl+, abre Configuración.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") go({ type: "escape" });
      else if (e.ctrlKey && e.key === ",") invoke("open_settings", { section: null }).catch(() => {});
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go]);


  const onSection = useCallback(
    (s: Section) => {
      if (DEBUG) {
        performance.mark("section");
        traceRef.current = "section";
      }
      go({ type: "section", section: s });
    },
    [go],
  );
  useEffect(() => {
    // Espera a conocer el modo (la consulta es asíncrona).
    const t = setTimeout(() => {
    }, 1500);
    return () => clearTimeout(t);
  }, [go]);
  const openSettings = useCallback(() => void invoke("open_settings", { section: null }).catch(() => {}), []);

  // Dictando sobre una sección o un formulario: siguen visibles (y con el foco en su campo, para que
  // el texto se pegue ahí) y la píldora se dibuja encima, arriba de la tarjeta.
  const overlay = view === "listening" && (prev === "open" || prev === "form");
  const base: View = overlay ? prev : view;
  overlayRef.current = overlay;
  const showBar = base === "bar" || base === "open" || base === "form" || base === "music";
  const bannerOn = !!curAlerts && (base === "open" || base === "form") && !listenState;

  return (
    <div className="flex h-screen w-screen items-start justify-center">
      <div ref={boxRef} className="isl" data-view={base} data-banner={bannerOn ? "on" : undefined} onMouseLeave={onContainerLeave} onMouseDown={onMouseDown}>
        {/* Siempre montada: escondida se sigue midiendo para la franja (sin reloj ni visibilidad). */}
        <Bar
          tomas={tomas.data?.tomas}
          active={base === "open" || base === "form" ? section : null}
          onSection={onSection}
          onSettings={openSettings}
          hidden={!showBar}
          onWidth={onBarWidth}
        />
        <Sections section={section} hidden={base !== "open"} banner={bannerOn} />
        {view === "listening" && (
          <div className={overlay ? "isl-listen-overlay" : undefined} onClick={openReply}>
            <Listening state={listenState} onConfirm={onConfirm} />
          </div>
        )}
        {view === "alert" && curAlerts && (
          <div>
            <AlertCard alerts={curAlerts} api={alerts} />
          </div>
        )}
        {/* Aviso pendiente con la isla abierta: banner abajo, sin cerrar nada. */}
        {bannerOn && curAlerts && (
          <div className="isl-banner">
            <AlertCard alerts={curAlerts} api={alerts} banner />
          </div>
        )}
      </div>
    </div>
  );
}
