// @ts-expect-error sin @types/node: se leen los fuentes como texto
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ISLAND_W, WIN_W } from "./model";

// El ancho de la isla vive en tres lados (CSS, modelo y la ventana de Rust): deben coincidir.
describe("ancho de la isla", () => {
  it("css_modelo_y_ventana_de_rust_coinciden", () => {
    const css = readFileSync("src/ui/tokens.css", "utf8");
    const rs = readFileSync("src-tauri/src/window.rs", "utf8");
    expect(css).toMatch(new RegExp(`--island-w:\\s*${ISLAND_W}px`));
    expect(rs).toMatch(new RegExp(`const STRIP_W: f64 = ${ISLAND_W}\\.0;`));
    expect(rs).toMatch(new RegExp(`pub const WIN_W: f64 = ${WIN_W}\\.0;`));
    expect(WIN_W).toBeGreaterThan(ISLAND_W);
  });

  it("cabe_el_nombre_de_la_siguiente_medicina", () => {
    // Antes eran 372 px y con el logo el nombre salía cortado («L…»).
    expect(ISLAND_W).toBeGreaterThanOrEqual(440);
  });
});
