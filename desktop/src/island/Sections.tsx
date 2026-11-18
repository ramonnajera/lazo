import { memo, type ComponentType } from "react";
import { getCitas, getConvocatorias, getMediciones, getTomas } from "../api/client";
import { ApoyosPanel } from "../panels/Apoyos";
import { ChatPanel } from "../panels/Chat";
import { CitasPanel } from "../panels/Citas";
import { HoyPanel } from "../panels/Hoy";
import { PanelFrame } from "../panels/OfflineBanner";
import { SaludPanel } from "../panels/Salud";
import { localToday } from "../panels/format";
import { usePanelData } from "../panels/usePanelData";
import type { Section } from "./model";

function Hoy() {
  const p = usePanelData("tomas", getTomas);
  return <PanelFrame panel={p}>{(d) => <HoyPanel items={d.tomas} today={d.fecha || localToday()} />}</PanelFrame>;
}
function Citas() {
  const p = usePanelData("citas", getCitas);
  return <PanelFrame panel={p}>{(d) => <CitasPanel items={d} today={localToday()} />}</PanelFrame>;
}
function Salud() {
  const p = usePanelData("mediciones", getMediciones);
  return <PanelFrame panel={p}>{(d) => <SaludPanel items={d} today={localToday()} />}</PanelFrame>;
}
function Apoyos() {
  const p = usePanelData("convocatorias", getConvocatorias);
  return <PanelFrame panel={p}>{(d) => <ApoyosPanel data={d} />}</PanelFrame>;
}

// Memorizados: cambiar de sección solo cambia el `display` de los contenedores, sin re-renderizar paneles.
const VIEWS: Record<Exclude<Section, "chat">, ComponentType> = {
  hoy: memo(Hoy),
  citas: memo(Citas),
  salud: memo(Salud),
  apoyos: memo(Apoyos),
};
const Chat = memo(ChatPanel);
const ORDER: Section[] = ["hoy", "citas", "salud", "apoyos", "chat"];

/**
 * Las cinco secciones quedan siempre montadas (sin peticiones ni montajes al cambiar);
 * solo la activa se muestra. `hidden` oculta todas (barra, formulario, escucha…).
 */
function SectionsImpl({ section, hidden, banner = false }: { section: Section; hidden: boolean; banner?: boolean }) {
  return (
    <div className={`isl-section${banner ? " with-banner" : ""}`} style={hidden ? { display: "none" } : undefined}>
      {ORDER.map((s) => {
        const View = s === "chat" ? null : VIEWS[s];
        return (
          <div key={s} data-section={s} style={s === section ? undefined : { display: "none" }}>
            {/* El chat necesita saber cuándo se muestra para bajar al último mensaje. */}
            {View ? <View /> : <Chat active={!hidden && section === "chat"} />}
          </div>
        );
      })}
    </div>
  );
}

export default memo(SectionsImpl);
