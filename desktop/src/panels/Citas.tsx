import type { Cita } from "../api/types";
import { fechaLarga, hora12, relDate } from "./format";

export function CitasPanel({ items, today }: { items: Cita[]; today: string }) {
  return (
    <div>
      <div className="pf-head">
        <span className="pf-title">Citas</span>
      </div>
      {items.length === 0 && <div className="cempty">No hay citas próximas.</div>}
      <div className="list-scroll">
        {items.map((c) => (
          <div key={c.id} className="cita" role="group" aria-label={`Cita con ${c.especialista}, ${fechaLarga(c.fecha)} a las ${hora12(c.hora)}${c.lugar ? `, en ${c.lugar}` : ""}`}>
            <div className="cita-top">
              <span className="cita-when">{relDate(c.fecha, today)} · {hora12(c.hora)}</span>
              <span className="cita-name" title={c.especialista}>{c.especialista}</span>
            </div>
            {(c.lugar || c.transporte) && <div className="cita-sub">{[c.lugar, c.transporte && `Transporte: ${c.transporte}`].filter(Boolean).join(" · ")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
