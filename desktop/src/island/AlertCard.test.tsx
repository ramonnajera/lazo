import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Alert } from "../alerts/due";
import type { AlertsApi } from "../alerts/useAlerts";
import type { Cita, Toma } from "../api/types";
import AlertCard from "./AlertCard";

afterEach(cleanup);

const api = (): AlertsApi => ({ current: null, error: null, done: vi.fn(), snooze: vi.fn(), close: vi.fn() });
const toma = (nombre: string, dosis = "50 mg"): Toma => ({ medicamentoId: nombre, nombre, dosis, instrucciones: "", fecha: "2026-11-18", hora: "20:00", estado: "ahora", horaReal: null, hasta: null });
const alerta = (nombre: string, dosis = "50 mg"): Alert => ({ id: `dosis:${nombre}`, refId: nombre, kind: "dosis", title: nombre, detail: dosis, hora: "20:00", at: new Date(2026, 10, 18, 20, 0), toma: toma(nombre, dosis) });

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

  it("cita_muestra_hora_y_lugar_y_solo_entendido", () => {
    const c: Cita = { id: "c1", especialista: "Dra. Ramírez", motivo: "", lugar: "Clínica 14", fecha: "2026-11-18", hora: "16:30", notas: "", transporte: "" };
    const a = api();
    render(<AlertCard alerts={[{ id: "cita:c1", refId: "c1", kind: "cita", title: "Dra. Ramírez", detail: "Clínica 14", hora: "16:30", at: new Date(2026, 10, 18, 16, 30), cita: c }]} api={a} />);
    expect(screen.getByText("Cita con Dra. Ramírez")).toBeTruthy();
    expect(screen.getByText("4:30 pm · Clínica 14")).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Entendido"]);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(a.done).toHaveBeenCalled();
  });
});
