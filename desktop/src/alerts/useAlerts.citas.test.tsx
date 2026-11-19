import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { IslandEvent } from "../island/model";

const hablar = vi.fn();
vi.mock("../voice/habla", () => ({ hablar: (t: string) => hablar(t) }));

// 18-nov-2026 14:45: la cita de las 16:30 está a 1 h 45 min.
const citas = { citas: [{ id: "c1", especialista: "Dra. Ramírez", motivo: "", lugar: "Clínica 14", fecha: "2026-11-18", hora: "16:30", notas: "", transporte: "" }] };
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: { path?: string }) => {
    if (cmd === "get_config") return Promise.resolve({ connection: { refreshSec: 60 }, general: {}, alerts: { dndFullscreen: false } });
    if (cmd === "api_request" && args?.path === "/citas") return Promise.resolve(citas);
    if (cmd === "api_request" && args?.path === "/tomas") return Promise.resolve({ fecha: "2026-11-18", ahora: {}, tomas: [] });
    return Promise.resolve(null);
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { useAlerts } from "./useAlerts";

const events: IslandEvent[] = [];
let titles: string[] = [];
function Probe() {
  const a = useAlerts("hidden", false, (e) => events.push(e));
  titles = a.current?.map((x) => `${x.kind}:${x.title}`) ?? [];
  return null;
}

beforeEach(() => {
  localStorage.clear();
  hablar.mockClear();
  events.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 10, 18, 14, 45));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("recordatorio de citas en la isla", () => {
  it("sale_dos_horas_antes_se_lee_y_no_se_repite", async () => {
    const r = render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(titles).toEqual(["cita:Dra. Ramírez"]);
    expect(events).toContainEqual({ type: "alert" });
    expect(hablar).toHaveBeenCalledWith("Recordatorio: tienes cita con Dra. Ramírez en 1 hora y 45 minutos, a las 4:30 pm, en Clínica 14.");
    r.unmount();

    // Otra vez la isla (p. ej. reinicio): la cita ya se avisó.
    hablar.mockClear();
    render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(titles).toEqual([]);
    expect(hablar).not.toHaveBeenCalled();
  });
});
