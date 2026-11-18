import type { Alert } from "../alerts/due";
import type { AlertsApi } from "../alerts/useAlerts";

const hhmm = (d: Date) => d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true });

/** `title`: texto del renglón; `when`: dosis y hora, o los nombres si son varias. */
export function describeAlert(alerts: Alert[]): { title: string; when: string } {
  if (alerts.length > 1) return { title: `${alerts.length} medicinas`, when: alerts.map((a) => a.title).join(" · ") };
  const a = alerts[0];
  return { title: `Es hora de ${a.title}`, when: [a.detail, hhmm(a.at)].filter(Boolean).join(" · ") };
}

/** `banner`: versión baja para mostrarse dentro de la isla abierta. */
export default function AlertCard({ alerts, api, banner = false }: { alerts: Alert[]; api: AlertsApi; banner?: boolean }) {
  const { title, when } = describeAlert(alerts);
  const stop = (f: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    f();
  };
  return (
    <div className={`al${banner ? " banner" : ""}`} role="alert">
      <div className="al-row">
        <span aria-hidden>💊</span>
        <span className="al-title" title={title}>
          {title}
        </span>
        {!banner && <span className="al-when">{when}</span>}
      </div>
      {api.error && <div className="al-err">{api.error}</div>}
      <div className="al-btns">
        <button className="al-b" onClick={stop(api.close)}>
          Cerrar
        </button>
        <button className="al-b" onClick={stop(api.snooze)}>
          10 min
        </button>
        <button className="al-b pri" onClick={stop(api.done)}>
          Ya la tomé
        </button>
      </div>
    </div>
  );
}
