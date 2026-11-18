import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import type { Toma } from "../api/types";
import { hora12 } from "../panels/format";
import { requiereAtencion, siguienteToma } from "../panels/Hoy";
import { IconCalendar, IconChat, IconGear, IconList, IconPulse, IconTodo } from "../ui/icons";
import { ISLAND_W, type Section } from "./model";

const BUTTONS: { section: Section; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { section: "hoy", label: "Hoy", Icon: IconTodo },
  { section: "citas", label: "Citas", Icon: IconCalendar },
  { section: "salud", label: "Salud", Icon: IconPulse },
  { section: "apoyos", label: "Apoyos", Icon: IconList },
  { section: "chat", label: "Hablar con Lazo", Icon: IconChat },
];

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** «20:00» → «8:00 pm» (la barra muestra las horas con am/pm). */
export const to12h = hora12;

/** Hora actual; se actualiza al cambiar el minuto, solo mientras `live` (sin temporizadores escondida). */
function useNow(live: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useLayoutEffect(() => {
    if (live) setNow(new Date());
  }, [live]);
  useEffect(() => {
    if (!live) return;
    let t: number;
    const arm = () => {
      t = window.setTimeout(() => {
        setNow(new Date());
        arm();
      }, 60_000 - (Date.now() % 60_000) + 20);
    };
    arm();
    return () => window.clearTimeout(t);
  }, [live]);
  return now;
}

interface Props {
  /** Tomas de hoy (null mientras carga o sin conexión). */
  tomas: Toma[] | null | undefined;
  active: Section | null;
  onSection: (s: Section) => void;
  /** Abre la configuración de Lazo (otra ventana, no una sección de la isla). */
  onSettings?: () => void;
  /** Escondida: sigue montada y medida (para la franja) pero invisible y sin reloj. */
  hidden?: boolean;
  /** Ancho de la barra sola, cada vez que cambia. */
  onWidth?: (w: number) => void;
}

/** Barra de la isla: HH:MM | íconos de sección y configuración | pendientes de hoy · siguiente toma. Mide siempre lo mismo. */
export default function Bar({ tomas, active, onSection, onSettings, hidden = false, onWidth }: Props) {
  const now = useNow(!hidden);
  const time = clock(now);
  const lista = tomas ?? [];
  const pendientes = lista.filter((t) => t.estado === "pendiente" || t.estado === "pospuesta" || requiereAtencion(t)).length;
  const sig = siguienteToma(lista);
  const nextText = sig ? `${sig.nombre} · ${hora12(sig.hora)}` : "";
  const urgente = !!sig && requiereAtencion(sig);

  const ref = useRef<HTMLDivElement>(null);
  const lastW = useRef(0);
  const cb = useRef(onWidth);
  cb.current = onWidth;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!hidden || !el) return;
    const w = Math.min(ISLAND_W, Math.ceil(el.getBoundingClientRect().width));
    if (w > 0 && w !== lastW.current) {
      lastW.current = w;
      cb.current?.(w);
    }
  }, [hidden, time, pendientes, nextText]);

  return (
    <div ref={ref} className="bar" style={hidden ? { visibility: "hidden" } : undefined} aria-hidden={hidden || undefined}>
      <span className="bar-clock">{to12h(time)}</span>
      <span className="bar-sep" />
      {BUTTONS.map(({ section, label, Icon }) => (
        <button key={section} type="button" className="icon-btn" aria-label={label} title={label} aria-pressed={active === section} onClick={() => onSection(section)}>
          <Icon />
        </button>
      ))}
      <button type="button" className="icon-btn" aria-label="Configuración" title="Configuración" onClick={() => onSettings?.()}>
        <IconGear />
      </button>
      {/* La cola va pegada al borde derecho: la barra mide lo mismo sola que abierta. */}
      <span className="bar-tail">
        {pendientes > 0 && (
          <button type="button" className={`count${urgente ? " urgent" : ""}`} aria-label={`${pendientes} tomas pendientes hoy`} title="Tomas pendientes de hoy" onClick={() => onSection("hoy")}>
            {pendientes}
          </button>
        )}
        {nextText && (
          <button type="button" className="bar-next" title={urgente ? "Es hora de esta medicina" : "Siguiente toma"} onClick={() => onSection("hoy")}>
            {nextText}
          </button>
        )}
      </span>
    </div>
  );
}
