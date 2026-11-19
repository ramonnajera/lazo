import { describe, expect, it } from "vitest";
import type { Cita, Toma } from "../api/types";
import { claveDe, dueAlerts, dueCitas, faltaTexto, fraseAviso } from "./due";

const toma = (o: Partial<Toma> = {}): Toma => ({ medicamentoId: "a", nombre: "Metformina", dosis: "850 mg", instrucciones: "", fecha: "2026-11-18", hora: "20:00", estado: "ahora", horaReal: null, hasta: null, ...o });
const now = new Date(2026, 10, 18, 20, 5);
const vacio = () => new Set<string>();

describe("dueAlerts", () => {
  it("avisa_las_tomas_que_ya_tocan_o_estan_atrasadas", () => {
    const r = dueAlerts([toma(), toma({ medicamentoId: "b", nombre: "Losartán", hora: "12:00", estado: "atrasada" })], now, vacio(), new Map());
    expect(r.map((a) => a.title)).toEqual(["Losartán", "Metformina"]); // la más antigua primero
    expect(r[0].id).toBe("dosis:b|2026-11-18|12:00");
  });

  it("no_avisa_lo_pendiente_ni_lo_resuelto", () => {
    const r = dueAlerts([toma({ estado: "pendiente" }), toma({ estado: "tomada" }), toma({ estado: "omitida" }), toma({ estado: "pospuesta" })], now, vacio(), new Map());
    expect(r).toEqual([]);
  });

  it("cada_toma_avisa_una_sola_vez", () => {
    const t = toma();
    expect(dueAlerts([t], now, new Set([`dosis:${claveDe(t)}`]), new Map())).toEqual([]);
  });

  it("una_toma_pospuesta_vuelve_a_avisar_al_vencer_el_plazo", () => {
    const t = toma();
    const id = `dosis:${claveDe(t)}`;
    expect(dueAlerts([t], now, vacio(), new Map([[id, new Date(2026, 10, 18, 20, 15)]]))).toEqual([]);
    expect(dueAlerts([t], new Date(2026, 10, 18, 20, 16), vacio(), new Map([[id, new Date(2026, 10, 18, 20, 15)]]))).toHaveLength(1);
  });

  it("ignora_fechas_u_horas_ilegibles", () => {
    expect(dueAlerts([toma({ hora: "xx" }), toma({ fecha: "mañana" })], now, vacio(), new Map())).toEqual([]);
  });
});

const cita = (o: Partial<Cita> = {}): Cita => ({ id: "c1", especialista: "Dra. Ramírez", motivo: "Revisión", lugar: "Clínica 14 del IMSS", fecha: "2026-11-18", hora: "16:30", notas: "", transporte: "", ...o });

describe("dueCitas", () => {
  const a14 = new Date(2026, 10, 18, 14, 0);

  it("avisa_dos_horas_antes_y_no_antes", () => {
    expect(dueCitas([cita()], new Date(2026, 10, 18, 14, 29), vacio())).toEqual([]);
    const r = dueCitas([cita()], new Date(2026, 10, 18, 14, 30), vacio());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "cita:c1|2026-11-18|16:30", kind: "cita", title: "Dra. Ramírez", detail: "Clínica 14 del IMSS" });
  });

  it("una_sola_vez_por_cita", () => {
    expect(dueCitas([cita()], a14 /* 2 h 30 */, vacio())).toEqual([]);
    const now = new Date(2026, 10, 18, 15, 0);
    expect(dueCitas([cita()], now, new Set(["cita:c1|2026-11-18|16:30"]))).toEqual([]);
  });

  it("si_la_cita_cambia_de_hora_vuelve_a_avisar", () => {
    const now = new Date(2026, 10, 18, 16, 0);
    expect(dueCitas([cita({ hora: "17:00" })], now, new Set(["cita:c1|2026-11-18|16:30"]))).toHaveLength(1);
  });

  it("no_avisa_citas_que_ya_empezaron_ni_fechas_ilegibles", () => {
    const now = new Date(2026, 10, 18, 16, 31);
    expect(dueCitas([cita(), cita({ id: "c2", hora: "xx" })], now, vacio())).toEqual([]);
  });

  it("sin_especialista_usa_el_motivo", () => {
    expect(dueCitas([cita({ especialista: "" })], new Date(2026, 10, 18, 16, 0), vacio())[0].title).toBe("Revisión");
  });
});

describe("frase en voz alta", () => {
  it("cuenta_cuanto_falta", () => {
    const at = new Date(2026, 10, 18, 16, 30);
    expect(faltaTexto(at, new Date(2026, 10, 18, 14, 30))).toBe("en 2 horas");
    expect(faltaTexto(at, new Date(2026, 10, 18, 15, 15))).toBe("en 1 hora y 15 minutos");
    expect(faltaTexto(at, new Date(2026, 10, 18, 15, 50))).toBe("en 40 minutos");
    expect(faltaTexto(at, new Date(2026, 10, 18, 16, 29))).toBe("en 1 minuto");
  });

  it("cita_con_hora_y_lugar", () => {
    const now = new Date(2026, 10, 18, 14, 30);
    expect(fraseAviso(dueCitas([cita()], now, vacio()), now)).toBe("Recordatorio: tienes cita con Dra. Ramírez en 2 horas, a las 4:30 pm, en Clínica 14 del IMSS.");
  });

  it("medicinas", () => {
    const r = dueAlerts([toma(), toma({ medicamentoId: "b", nombre: "Losartán" })], now, vacio(), new Map());
    expect(fraseAviso(r, now)).toBe("Es hora de tus medicinas: Metformina, Losartán.");
    expect(fraseAviso(r.slice(0, 1), now)).toBe("Es hora de Metformina, 850 mg.");
  });
});
