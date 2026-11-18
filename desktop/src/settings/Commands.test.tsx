import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Commands from "./Commands";
import type { Config } from "../config/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(cleanup);

const config = {
  commands: {
    sites: [{ name: "youtube", target: "https://www.youtube.com" }],
    programs: [],
    folders: [],
    searchEngines: [{ name: "google", urlTemplate: "https://www.google.com/search?q={q}" }],
    systemEnabled: true,
    confirmPower: true,
  },
} as unknown as Config;

describe("commands settings", () => {
  it("adds_a_program_from_the_start_menu", async () => {
    vi.mocked(invoke).mockResolvedValue([{ name: "Spotify", target: "C:\\SM\\Spotify.lnk" }]);
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Commands config={config} saveConfig={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar desde el menú Inicio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Spotify" }));
    expect(invoke).toHaveBeenCalledWith("start_menu_list");
    expect(save.mock.calls[0][0].commands.programs).toEqual([{ name: "Spotify", target: "C:\\SM\\Spotify.lnk" }]);
  });

  it("toggles_power_confirmation", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Commands config={config} saveConfig={save} />);
    fireEvent.click(screen.getByLabelText("Pedir confirmación antes de suspender o apagar"));
    expect(save.mock.calls[0][0].commands.confirmPower).toBe(false);
  });

  it("keeps_a_half_typed_row_until_complete", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Commands config={config} saveConfig={save} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[0]);
    const name = screen.getByLabelText("Nombre 2");
    fireEvent.change(name, { target: { value: "gmail" } });
    fireEvent.blur(name);
    expect(save).not.toHaveBeenCalled();
    const target = screen.getByLabelText("Dirección (https://…) 2");
    expect((screen.getByLabelText("Nombre 2") as HTMLInputElement).value).toBe("gmail");
    fireEvent.change(target, { target: { value: "https://mail.google.com" } });
    fireEvent.blur(target);
    expect(save.mock.calls[0][0].commands.sites).toEqual([
      { name: "youtube", target: "https://www.youtube.com" },
      { name: "gmail", target: "https://mail.google.com" },
    ]);
  });

  it("half_typed_search_engine_survives_rerender", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<Commands config={config} saveConfig={save} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Agregar" })[3]);
    fireEvent.change(screen.getByLabelText("Nombre 2", { selector: "[data-table=Buscadores] input" }), { target: { value: "ddg" } });
    rerender(<Commands config={{ ...config }} saveConfig={save} />);
    expect((screen.getByLabelText("Nombre 2", { selector: "[data-table=Buscadores] input" }) as HTMLInputElement).value).toBe("ddg");
  });

  it("rejects_non_web_addresses", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Commands config={config} saveConfig={save} />);
    const target = screen.getByLabelText("Dirección (https://…) 1");
    fireEvent.change(target, { target: { value: "file:///C:/Windows/System32/calc.exe" } });
    fireEvent.blur(target);
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Dirección no válida: debe empezar con http:// o https://")).toBeTruthy();
  });
});

describe("commands rows layout", () => {
  // "Nombre 1" se repite en cada tabla: basta con la primera.
  const classes = (label: string) => screen.getAllByLabelText(label)[0].className.split(/\s+/);

  it("name_keeps_a_fixed_width_and_the_target_takes_the_rest", () => {
    // `w-full` junto a un ancho fijo gana en Tailwind: el nombre ocupaba la fila y sacaba lo demás de la ventana.
    render(<Commands config={config} saveConfig={vi.fn()} />);
    const name = classes("Nombre 1");
    expect(name).toContain("w-36");
    expect(name).toContain("shrink-0");
    expect(name).not.toContain("w-full");
    const target = classes("Dirección (https://…) 1");
    expect(target).toContain("flex-1");
    expect(target).toContain("min-w-0");
    expect(target).not.toContain("w-full");
  });

  it("remove_button_never_shrinks", () => {
    render(<Commands config={config} saveConfig={vi.fn()} />);
    expect(classes("Quitar youtube")).toContain("shrink-0");
  });
});
