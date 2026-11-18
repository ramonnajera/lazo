import type { Medicion } from "../api/types";
import { relDate, hora12 } from "./format";

const TITULO: Record<string, string> = { presion: "Presión", glucosa: "Glucosa", peso: "Peso", animo: "Ánimo", dolor: "Dolor" };

export function SaludPanel({ items, today }: { items: Medicion[]; today: string }) {
  return (
    <div>
      <div className="pf-head">
        <span className="pf-title">Cómo estoy</span>
      </div>
      {items.length === 0 && <div className="cempty">Todavía no hay mediciones. Anótalas en la app del teléfono.</div>}
      <div className="list-scroll">
        {items.map((m) => (
          <div key={m.id} className="cita" role="group" aria-label={`${TITULO[m.tipo] ?? m.tipo}: ${m.texto}, ${relDate(m.fecha, today)} ${hora12(m.hora)}.${m.aviso ? ` Aviso: ${m.aviso.texto}.` : ""}`}>
            <div className="cita-top">
              <span className="cita-when">{relDate(m.fecha, today)} · {hora12(m.hora)}</span>
              <span className="cita-name">{TITULO[m.tipo] ?? m.tipo}: {m.texto}</span>
            </div>
            {m.aviso && <div className={`cita-sub aviso${m.aviso.nivel === "alta" ? " alta" : ""}`}><span aria-hidden>⚠</span> {m.aviso.texto} (aviso orientativo, no un diagnóstico)</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
