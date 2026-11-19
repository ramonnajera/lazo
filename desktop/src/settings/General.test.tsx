import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Config } from "../config/types";
import General from "./General";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(true) }));
vi.mock("@tauri-apps/api/window", () => ({ availableMonitors: vi.fn().mockResolvedValue([]) }));

const config = {
  general: { autostart: true, openOnHover: true, monitor: null, theme: "system", sounds: true },
  alerts: { eventLeadMin: 15, todosTime: "09:00", dndFrom: null, dndTo: null, dndFullscreen: true },
} as unknown as Config;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("General", () => {
  it("la_voz_se_puede_apagar_y_queda_guardada", () => {
    render(<General config={config} saveConfig={vi.fn().mockResolvedValue(undefined)} />);
    const voz = screen.getByRole("checkbox", { name: /Leer en voz alta/ }) as HTMLInputElement;
    expect(voz.checked).toBe(true);
    fireEvent.click(voz);
    expect(localStorage.getItem("lazo.voz")).toBe("0");
    expect(voz.checked).toBe(false);
  });

  it("pantalla_completa_se_guarda_en_la_configuracion", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<General config={config} saveConfig={save} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /pantalla completa/ }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ alerts: expect.objectContaining({ dndFullscreen: false }) }));
  });
});
