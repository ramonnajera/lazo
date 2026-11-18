import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Listening from "./Listening";
import type { ListenState } from "./listen";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));

let pending: Map<number, FrameRequestCallback>;
let nextId: number;
beforeEach(() => {
  pending = new Map();
  nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const st = (over: Partial<ListenState>): ListenState => ({ id: 1, mode: "dictation", phase: "recording", level: 0.5, ...over });

describe("listening pill", () => {
  it("listening_wave_stops_after_recording", () => {
    const { rerender } = render(<Listening state={st({})} />);
    expect(pending.size).toBe(1);
    expect(screen.getAllByTestId("wave-bar")).toHaveLength(9);
    rerender(<Listening state={st({ phase: "processing" })} />);
    expect(pending.size).toBe(0);
    rerender(<Listening state={st({ phase: "done", text: "Hola" })} />);
    expect(pending.size).toBe(0);
    expect(screen.queryAllByTestId("wave-bar")).toHaveLength(0);
  });

  it("wave_runs_at_most_30fps_and_shows_time", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    render(<Listening state={st({})} />);
    const run = (t: number) => {
      now.mockReturnValue(t);
      const [id, cb] = [...pending][0];
      pending.delete(id);
      act(() => cb(t));
    };
    expect(screen.getByText("0:00")).toBeTruthy();
    run(1010); // < 33 ms desde el último cuadro: se omite, pero sigue pendiente
    expect(pending.size).toBe(1);
    run(3100);
    expect(screen.getByText("0:02")).toBeTruthy();
    now.mockRestore();
  });

  it("shows_label_and_later_phases_scroll_capped", () => {
    const { container } = render(<Listening state={st({ mode: "lazo", phase: "done", text: "respuesta larga", reply: true })} />);
    expect(screen.getByText("Lazo")).toBeTruthy();
    expect(screen.getByText("respuesta larga")).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toContain("lis");
  });
});
