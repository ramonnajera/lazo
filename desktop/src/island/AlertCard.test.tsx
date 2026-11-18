import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Alert } from "../alerts/due";
import type { AlertsApi } from "../alerts/useAlerts";
import type { Toma } from "../api/types";
import AlertCard from "./AlertCard";

afterEach(cleanup);

const api = (): AlertsApi => ({ current: null, error: null, done: vi.fn(), snooze: vi.fn(), close: vi.fn() });
const toma = (nombre: string, dosis = "50 mg"): Toma => ({ medicamentoId: nombre, nombre, dosis, instrucciones: "", fecha: "2026-11-18", hora: "20:00", estado: "ahora", horaReal: null, hasta: null });
const alerta = (nombre: string, dosis = "50 mg"): Alert => ({ id: `dosis:${nombre}`, refId: nombre, kind: "dosis", title: nombre, detail: dosis, at: new Date(2026, 10, 18, 20, 0), toma: toma(nombre, dosis) });

describe("alert card", () => {
  it("tiene_tres_acciones_y_las_ejecuta", () => {
    const a = api();
    render(<AlertCard alerts={[alerta("Losartán")]} api={a} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Cerrar", "10 min", "Ya la tomé"]);
    fireEvent.click(screen.getByRole("button", { name: "Ya la tomé" }));
    fireEvent.click(screen.getByRole("button", { name: "10 min" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(a.done).toHaveBeenCalled();
    expect(a.snooze).toHaveBeenCalled();
    expect(a.close).toHaveBeenCalled();
  });

  it("una_medicina_muestra_nombre_dosis_y_hora_con_am_pm", () => {
    render(<AlertCard alerts={[alerta("Losartán")]} api={api()} />);
    expect(screen.getByText("Es hora de Losartán")).toBeTruthy();
    expect(screen.getByText(/50 mg · 8:00\s?p\.?\s?m\.?/i)).toBeTruthy();
  });

  it("varias_medicinas_a_la_misma_hora_se_juntan_en_una_tarjeta", () => {
    render(<AlertCard alerts={[alerta("Losartán"), alerta("Metformina", "850 mg")]} api={api()} />);
    expect(screen.getByText("2 medicinas")).toBeTruthy();
    expect(screen.getByText("Losartán · Metformina")).toBeTruthy();
  });

  it("el_error_se_anuncia_como_alerta", () => {
    const a = { ...api(), error: "No se pudo registrar. Reintenta." };
    render(<AlertCard alerts={[alerta("Losartán")]} api={a} />);
    expect(screen.getByText("No se pudo registrar. Reintenta.")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("el_banner_solo_trae_el_titulo", () => {
    render(<AlertCard alerts={[alerta("Losartán")]} api={api()} banner />);
    expect(screen.getByText("Es hora de Losartán")).toBeTruthy();
    expect(screen.queryByText(/50 mg/)).toBeNull();
  });
});
