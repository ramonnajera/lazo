import type { Alert } from "../alerts/due";
import type { AlertsApi } from "../alerts/useAlerts";
import { hora12 } from "../panels/format";

/** `title`: texto del renglón; `when`: dosis y hora, o los nombres si son varias. Horas con am/pm, como en toda la isla. */
export function describeAlert(alerts: Alert[]): { title: string; when: string } {
  const a = alerts[0];
  if (a.kind === "cita") return { title: `Cita con ${a.title}`, when: [hora12(a.hora), a.detail].filter(Boolean).join(" · ") };
  if (alerts.length > 1) return { title: `${alerts.length} medicinas`, when: alerts.map((x) => x.title).join(" · ") };
  return { title: `Es hora de ${a.title}`, when: [a.detail, hora12(a.hora)].filter(Boolean).join(" · ") };
}

/** `banner`: versión baja para mostrarse dentro de la isla abierta. */
export default function AlertCard({ alerts, api, banner = false }: { alerts: Alert[]; api: AlertsApi; banner?: boolean }) {
  const { title, when } = describeAlert(alerts);
  const cita = alerts[0]?.kind === "cita";
  const stop = (f: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    f();
  };
  return (
    <div className={`al${banner ? " banner" : ""}${cita ? " al-cita" : ""}`} role="alert">
      <div className="al-row">
        <span aria-hidden>{cita ? "📅" : "💊"}</span>
        <span className="al-title" title={title}>
          {title}
        </span>
        {!banner && <span className="al-when" title={when}>{when}</span>}
      </div>
      {api.error && <div className="al-err">{api.error}</div>}
      <div className="al-btns">
        {cita ? (
          <button className="al-b pri" onClick={stop(api.done)}>
            Entendido
          </button>
        ) : (
          <>
            <button className="al-b" onClick={stop(api.close)}>
              Cerrar
            </button>
            <button className="al-b" onClick={stop(api.snooze)}>
              10 min
            </button>
            <button className="al-b pri" onClick={stop(api.done)}>
              Ya la tomé
            </button>
          </>
        )}
      </div>
    </div>
  );
}
