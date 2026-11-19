import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CrearPerfil from "./CrearPerfil";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => { vi.mocked(invoke).mockReset(); vi.mocked(invoke).mockResolvedValue(undefined); });
afterEach(cleanup);

describe("crear perfil (primer uso)", () => {
  it("pide_solo_nombre_y_discapacidad_y_el_token_se_queda_en_rust", async () => {
    const listo = vi.fn();
    render(<CrearPerfil onListo={listo} />);
    const boton = screen.getByRole("button", { name: "Crear mi perfil" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true); // sin nombre no se puede
    expect(screen.queryByLabelText(/servidor|dirección|url/i)).toBeNull(); // nunca pide la dirección
    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "  Ana Ejemplo " } });
    fireEvent.change(screen.getByLabelText("Qué te cuesta más"), { target: { value: "visual" } });
    await act(async () => { fireEvent.click(boton); });
    expect(invoke).toHaveBeenCalledWith("create_profile", { name: "Ana Ejemplo", disability: "visual" });
    expect(listo).toHaveBeenCalled();
  });

  it("si_el_servidor_rechaza_muestra_el_motivo", async () => {
    vi.mocked(invoke).mockRejectedValue({ kind: "http", status: 503, message: "este servidor no admite más personas" });
    render(<CrearPerfil />);
    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "Ana" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crear mi perfil" })); });
    expect(screen.getByText("este servidor no admite más personas")).toBeTruthy();
  });

  it("en_configuracion_no_usa_texto_blanco_que_no_se_ve_en_tema_claro", () => {
    const { container } = render(<CrearPerfil enConfig />);
    expect(container.innerHTML).not.toMatch(/(text|bg)-white\//);
  });
});
