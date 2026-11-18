import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Toma } from "../api/types";
import Bar from "./Bar";

afterEach(cleanup);

const toma = (o: Partial<Toma> = {}): Toma => ({ medicamentoId: "a", nombre: "Metformina", dosis: "850 mg", instrucciones: "", fecha: "2026-11-18", hora: "20:00", estado: "pendiente", horaReal: null, hasta: null, ...o });
const base = { tomas: null, active: null, onSection: () => {} };

describe("Bar", () => {
  it("tiene_los_cinco_destinos_y_la_configuracion_en_ese_orden", () => {
    render(<Bar {...base} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Hoy", "Citas", "Salud", "Apoyos", "Hablar con Lazo", "Configuración"]);
  });

  it("el_clic_en_un_destino_lo_abre", () => {
    const onSection = vi.fn();
    render(<Bar {...base} onSection={onSection} />);
    fireEvent.click(screen.getByLabelText("Citas"));
    fireEvent.click(screen.getByLabelText("Hablar con Lazo"));
    expect(onSection.mock.calls).toEqual([["citas"], ["chat"]]);
  });

  it("la_configuracion_se_abre_aparte_y_nunca_queda_resaltada", () => {
    const onSettings = vi.fn();
    const onSection = vi.fn();
    render(<Bar {...base} onSection={onSection} onSettings={onSettings} active="hoy" />);
    const gear = screen.getByLabelText("Configuración");
    expect(gear.getAttribute("aria-pressed")).toBeNull();
    fireEvent.click(gear);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onSection).not.toHaveBeenCalled();
  });

  it("resalta_solo_la_seccion_abierta", () => {
    render(<Bar {...base} active="salud" />);
    expect(screen.getByLabelText("Salud").getAttribute("aria-pressed")).toBe("true");
    for (const l of ["Hoy", "Citas", "Apoyos", "Hablar con Lazo"]) expect(screen.getByLabelText(l).getAttribute("aria-pressed")).toBe("false");
  });

  it("sin_tomas_no_hay_conteo_ni_siguiente", () => {
    const { container } = render(<Bar {...base} tomas={[toma({ estado: "tomada" })]} />);
    expect(container.querySelector(".count")).toBeNull();
    expect(container.querySelector(".bar-next")).toBeNull();
  });

  it("muestra_cuantas_tomas_faltan_y_la_siguiente_con_hora_am_pm", () => {
    const onSection = vi.fn();
    render(<Bar {...base} onSection={onSection} tomas={[toma({ hora: "08:00", estado: "tomada" }), toma({ hora: "20:00" }), toma({ medicamentoId: "b", nombre: "Losartán", hora: "21:30" })]} />);
    expect(screen.getByLabelText("2 tomas pendientes hoy").textContent).toBe("2");
    fireEvent.click(screen.getByText("Metformina · 8:00 pm"));
    expect(onSection).toHaveBeenCalledWith("hoy");
  });

  it("una_toma_que_ya_toca_se_marca_como_urgente_con_su_texto", () => {
    const { container } = render(<Bar {...base} tomas={[toma({ estado: "atrasada", hora: "12:00" })]} />);
    expect(container.querySelector(".count.urgent")).toBeTruthy();
    expect(screen.getByTitle("Es hora de esta medicina")).toBeTruthy();
  });

  it("escondida_sigue_montada_pero_invisible_y_sin_reloj_vivo", () => {
    const { container } = render(<Bar {...base} hidden />);
    const bar = container.querySelector(".bar") as HTMLElement;
    expect(bar.style.visibility).toBe("hidden");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
  });
});
