import { describe, expect, it } from "vitest";
import type { Toma } from "../api/types";
import { claveDe, dueAlerts } from "./due";

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
