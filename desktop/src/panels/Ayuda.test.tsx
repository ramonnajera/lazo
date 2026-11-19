import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Toma } from "../api/types";
import { AyudaBoton, textoAyuda } from "./Ayuda";
import { HoyPanel, resumenDia } from "./Hoy";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const hablar = vi.fn();
vi.mock("../voice/habla", () => ({ hablar: (t: string, o?: unknown) => hablar(t, o) }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  hablar.mockClear();
});
afterEach(cleanup);

const respuesta = (cuidadores: number) => ({ ayuda: { id: "h1", fecha: "2026-11-18", hora: "14:00", mensaje: "" }, cuidadores });

describe("Necesito ayuda", () => {
  it("pide_confirmacion_antes_de_avisar", async () => {
    vi.mocked(invoke).mockResolvedValue(respuesta(2));
    render(<AyudaBoton />);
    fireEvent.click(screen.getByRole("button", { name: "Necesito ayuda" }));
    // Primer clic: solo pregunta; aún no se avisa a nadie.
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText("¿Aviso a tus cuidadores que necesitas ayuda?")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, avisar" }));
    });
    expect(invoke).toHaveBeenCalledWith("api_request", { method: "POST", path: "/ayuda", body: {} });
    expect(screen.getByText("Avisé a 2 cuidadores. Si es una emergencia, llama al 911.")).toBeTruthy();
    expect(hablar).toHaveBeenCalledWith("Avisé a 2 cuidadores. Si es una emergencia, llama al 911.", { forzar: true });
  });

  it("cancelar_no_avisa", () => {
    render(<AyudaBoton />);
    fireEvent.click(screen.getByRole("button", { name: "Necesito ayuda" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByText(/Aviso a tus cuidadores/)).toBeNull();
  });

  it("la_confirmacion_se_retira_sola", () => {
    vi.useFakeTimers();
    try {
      render(<AyudaBoton />);
      fireEvent.click(screen.getByRole("button", { name: "Necesito ayuda" }));
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      expect(screen.queryByRole("button", { name: "Sí, avisar" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin_cuidadores_lo_dice_y_un_error_ofrece_reintentar", async () => {
    expect(textoAyuda(0)).toMatch(/^Todavía no tienes cuidadores/);
    expect(textoAyuda(1)).toBe("Avisé a 1 cuidador. Si es una emergencia, llama al 911.");
    vi.mocked(invoke).mockRejectedValueOnce({ kind: "offline", message: "x" }).mockResolvedValueOnce(respuesta(0));
    render(<AyudaBoton />);
    fireEvent.click(screen.getByRole("button", { name: "Necesito ayuda" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, avisar" }));
    });
    expect(screen.getByText(/No pude enviar el aviso/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(screen.getByText(/Todavía no tienes cuidadores/)).toBeTruthy();
  });

  it("esta_en_el_panel_hoy", () => {
    render(<HoyPanel items={[]} today="2026-11-18" />);
    expect(screen.getByRole("button", { name: "Necesito ayuda" })).toBeTruthy();
  });
});

const toma = (o: Partial<Toma> = {}): Toma => ({ medicamentoId: "a", nombre: "Metformina", dosis: "850 mg", instrucciones: "", fecha: "2026-11-18", hora: "20:00", estado: "pendiente", horaReal: null, hasta: null, ...o });

describe("Escuchar mi día", () => {
  it("resume_lo_urgente_lo_que_falta_y_lo_tomado", () => {
    const items = [toma({ hora: "08:00", estado: "tomada" }), toma({ medicamentoId: "b", nombre: "Losartán", dosis: "50 mg", hora: "12:00", estado: "atrasada" }), toma()];
    expect(resumenDia(items)).toBe("Ya toca: Losartán 50 mg, de las 12:00 pm. Falta: Metformina 850 mg a las 8:00 pm. Llevas 1 tomada.");
    expect(resumenDia([toma({ estado: "tomada" }), toma({ estado: "tomada" })])).toBe("Todo al día: no te falta ninguna toma. Llevas 2 tomadas.");
    expect(resumenDia([])).toBe("Hoy no tienes tomas programadas.");
  });

  it("el_boton_lo_lee_en_voz_alta", () => {
    render(<HoyPanel items={[toma()]} today="2026-11-18" />);
    fireEvent.click(screen.getByRole("button", { name: /Escuchar mi día/ }));
    expect(hablar).toHaveBeenCalledWith("Falta: Metformina 850 mg a las 8:00 pm. Llevas 0 tomadas.", { forzar: true });
  });
});
