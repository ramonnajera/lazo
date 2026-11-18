import { describe, expect, it } from "vitest";
import { fechaLarga, hora12, localToday, relDate } from "./format";

describe("format", () => {
  it("hora12_usa_am_pm", () => {
    expect(hora12("08:00")).toBe("8:00 am");
    expect(hora12("20:05")).toBe("8:05 pm");
    expect(hora12("00:00")).toBe("12:00 am");
    expect(hora12("12:30")).toBe("12:30 pm");
    expect(hora12(null)).toBe("");
    expect(hora12(undefined)).toBe("");
    expect(hora12("basura")).toBe("");
  });
  it("relDate", () => {
    expect(relDate("2026-11-18", "2026-11-18")).toBe("Hoy");
    expect(relDate("2026-11-19", "2026-11-18")).toBe("Mañana");
    expect(relDate("2026-11-20", "2026-11-18")).toBe("vie 20 nov");
    expect(relDate("2026-12-01", "2026-11-30")).toBe("Mañana");
  });
  it("fechaLarga", () => {
    expect(fechaLarga("2026-11-18")).toBe("miércoles 18 de noviembre");
    expect(fechaLarga("nada")).toBe("nada");
  });
  it("localToday_es_la_fecha_local_no_la_utc", () => {
    expect(localToday(new Date(2026, 10, 18, 23, 59))).toBe("2026-11-18");
  });
});
