import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Config } from "../config/types";
import Connection from "./Connection";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue({ fecha: "2026-11-18", ahora: { fecha: "2026-11-18", hora: "08:00" }, tomas: [] });
});
afterEach(cleanup);

const config = { connection: { apiUrl: "http://localhost:18800", refreshSec: 60 } } as unknown as Config;

describe("conexión", () => {
  it("vincular_pide_seis_digitos_y_usa_el_comando_de_rust_sin_pasar_el_token_por_la_interfaz", async () => {
    render(<Connection config={config} saveConfig={vi.fn()} />);
    const boton = screen.getByRole("button", { name: "Vincular" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Código de 6 dígitos"), { target: { value: "12ab3456789" } });
    expect((screen.getByLabelText("Código de 6 dígitos") as HTMLInputElement).value).toBe("123456"); // solo dígitos, máximo 6
    expect(boton.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(boton);
    });
    expect(invoke).toHaveBeenCalledWith("link_device", { code: "123456", name: "Computadora con Windows" });
    expect(screen.getByText("✓ Computadora vinculada")).toBeTruthy();
  });

  it("un_codigo_invalido_muestra_el_error_del_servidor", async () => {
    vi.mocked(invoke).mockRejectedValue({ kind: "http", status: 404, message: "el código no existe, ya se usó o venció" });
    render(<Connection config={config} saveConfig={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Código de 6 dígitos"), { target: { value: "000000" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    });
    expect(screen.getByText("el código no existe, ya se usó o venció")).toBeTruthy();
  });
});
