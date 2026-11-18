import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Cita, ListaConvocatorias, Medicion, Toma } from "../api/types";
import { ApoyosPanel } from "./Apoyos";
import { CitasPanel } from "./Citas";
import { HoyPanel, siguienteToma, textoEstado } from "./Hoy";
import { SaludPanel } from "./Salud";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const abrir = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (u: string) => abrir(u) }));
vi.mock("../voice/habla", () => ({ hablar: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue({});
  abrir.mockClear();
});
afterEach(cleanup);

const toma = (o: Partial<Toma> = {}): Toma => ({ medicamentoId: "a", nombre: "Metformina", dosis: "850 mg", instrucciones: "Con alimentos", fecha: "2026-11-18", hora: "20:00", estado: "pendiente", horaReal: null, hasta: null, ...o });
const hoy = "2026-11-18";

describe("Hoy", () => {
  it("la_toma_que_toca_ahora_va_en_grande_con_tres_acciones", () => {
    const items = [toma({ hora: "08:00", estado: "tomada", horaReal: "08:05" }), toma({ medicamentoId: "b", nombre: "Losartán", dosis: "50 mg", hora: "12:00", estado: "atrasada" }), toma()];
    render(<HoyPanel items={items} today={hoy} />);
    expect(screen.getByText("Es hora de tu medicina")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ya la tomé" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pospón 10 min" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Omitir" })).toBeTruthy();
  });

  it("los_estados_se_dicen_con_palabras", () => {
    expect(textoEstado(toma({ estado: "tomada", horaReal: "08:05" }))).toBe("Tomada a las 8:05 am");
    expect(textoEstado(toma({ estado: "atrasada" }))).toBe("Atrasada");
    expect(textoEstado(toma({ estado: "pospuesta", hasta: { fecha: hoy, hora: "20:15" } }))).toBe("Pospuesta hasta las 8:15 pm");
    expect(textoEstado(toma({ estado: "omitida" }))).toBe("Omitida");
  });

  it("siguienteToma_prefiere_lo_urgente_y_si_no_lo_proximo", () => {
    expect(siguienteToma([toma({ estado: "tomada" }), toma({ hora: "21:00" }), toma({ hora: "12:00", estado: "ahora" })])?.hora).toBe("12:00");
    expect(siguienteToma([toma({ estado: "tomada" }), toma({ hora: "21:00" })])?.hora).toBe("21:00");
    expect(siguienteToma([toma({ estado: "tomada" })])).toBeUndefined();
  });

  it("ya_la_tome_registra_la_toma_en_el_servidor", async () => {
    render(<HoyPanel items={[toma({ estado: "ahora", hora: "20:00" })]} today={hoy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ya la tomé" }));
    });
    expect(invoke).toHaveBeenCalledWith("api_request", { method: "POST", path: "/tomas", body: { medicamentoId: "a", fecha: hoy, hora: "20:00", estado: "tomada" } });
  });

  it("posponer_manda_diez_minutos_y_omitir_no_manda_minutos", async () => {
    render(<HoyPanel items={[toma({ estado: "ahora" })]} today={hoy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pospón 10 min" }));
    });
    expect(vi.mocked(invoke).mock.calls[0][1]).toMatchObject({ body: { estado: "pospuesta", minutos: 10 } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Omitir" }));
    });
    expect((vi.mocked(invoke).mock.calls[1][1] as { body: Record<string, unknown> }).body.minutos).toBeUndefined();
  });

  it("deshacer_solo_aparece_en_lo_resuelto_y_vuelve_la_toma_a_pendiente", async () => {
    render(<HoyPanel items={[toma({ hora: "08:00", estado: "tomada", horaReal: "08:05" }), toma()]} today={hoy} />);
    expect(screen.getAllByRole("button", { name: /^Deshacer/ })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Deshacer/ }));
    });
    expect(vi.mocked(invoke).mock.calls[0][1]).toMatchObject({ body: { estado: "pendiente", hora: "08:00" } });
  });

  it("un_error_del_servidor_se_muestra_como_alerta", async () => {
    vi.mocked(invoke).mockRejectedValue({ kind: "http", status: 404, message: "esa dosis no existe" });
    render(<HoyPanel items={[toma({ estado: "ahora" })]} today={hoy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ya la tomé" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("esa dosis no existe");
  });

  it("sin_tomas_o_todo_al_dia_lo_dice", () => {
    const { unmount } = render(<HoyPanel items={[]} today={hoy} />);
    expect(screen.getByText("Hoy no tienes tomas programadas.")).toBeTruthy();
    unmount();
    render(<HoyPanel items={[toma({ estado: "tomada" })]} today={hoy} />);
    expect(screen.getByText(/Todo al día/)).toBeTruthy();
  });
});

describe("Citas y Salud", () => {
  const citas: Cita[] = [{ id: "c", especialista: "Oftalmología", motivo: "", lugar: "Hospital General", fecha: "2026-11-20", hora: "09:30", notas: "", transporte: "Taxi adaptado" }];
  it("citas_con_fecha_relativa_hora_y_lugar", () => {
    render(<CitasPanel items={citas} today={hoy} />);
    expect(screen.getByText("vie 20 nov · 9:30 am")).toBeTruthy();
    expect(screen.getByText("Oftalmología")).toBeTruthy();
    expect(screen.getByText("Hospital General · Transporte: Taxi adaptado")).toBeTruthy();
  });
  it("sin_citas_lo_dice", () => {
    render(<CitasPanel items={[]} today={hoy} />);
    expect(screen.getByText("No hay citas próximas.")).toBeTruthy();
  });
  it("las_mediciones_fuera_de_rango_traen_el_aviso_en_texto_y_no_son_un_diagnostico", () => {
    const m: Medicion[] = [{ id: "1", tipo: "glucosa", texto: "260 mg/dL", nota: "", fecha: hoy, hora: "09:10", aviso: { nivel: "media", texto: "Glucosa alta: 260 mg/dL" } }];
    render(<SaludPanel items={m} today={hoy} />);
    expect(screen.getByText(/Glucosa alta: 260 mg\/dL \(aviso orientativo, no un diagnóstico\)/)).toBeTruthy();
  });
});

describe("Apoyos", () => {
  const data: ListaConvocatorias = {
    items: [
      { id: "premio", nombre: "Premio estatal por la discapacidad Manuel Trueva Martínez", dependencia: "Dirección de Grupos Vulnerables", documento: "https://x/p.pdf", ficha: "https://x/f", tipoDocumento: "pdf", discapacidad: true },
      { id: "ali", nombre: "Apoyos alimenticios", dependencia: "Frontera Norte", documento: "https://x/a.png", ficha: null, tipoDocumento: "imagen", discapacidad: false },
    ],
    ultimaLectura: "2026-11-18T08:00:00-06:00", error: null, nuevas: ["premio"],
  };
  it("las_de_discapacidad_van_primero_y_la_nueva_se_marca_con_texto", () => {
    render(<ApoyosPanel data={data} />);
    const titulos = screen.getAllByText(/Para personas con discapacidad|Otras convocatorias/).map((n) => n.textContent);
    expect(titulos).toEqual(["Para personas con discapacidad", "Otras convocatorias"]);
    expect(screen.getByText("Nueva")).toBeTruthy();
  });
  it("abrir_usa_el_enlace_oficial_del_documento", () => {
    render(<ApoyosPanel data={data} />);
    fireEvent.click(screen.getByRole("button", { name: /Abrir la convocatoria: Premio estatal/ }));
    expect(abrir).toHaveBeenCalledWith("https://x/p.pdf");
  });
  it("buscar_nuevas_pide_la_actualizacion_al_servidor", async () => {
    render(<ApoyosPanel data={data} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Buscar nuevas" }));
    });
    expect(invoke).toHaveBeenCalledWith("api_request", { method: "POST", path: "/convocatorias/actualizar", body: null });
  });
  it("no_inventa_fechas_y_lo_aclara", () => {
    render(<ApoyosPanel data={data} />);
    expect(screen.getByText(/Lazo no inventa fechas/)).toBeTruthy();
  });
  it("si_la_lectura_fallo_se_muestra_la_ultima_lista_con_el_motivo", () => {
    render(<ApoyosPanel data={{ ...data, error: "sin conexión" }} />);
    expect(screen.getByText(/No pude leer la página de la Secretaría \(sin conexión\)/)).toBeTruthy();
  });
});
