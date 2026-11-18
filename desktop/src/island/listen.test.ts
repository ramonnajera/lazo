import { describe, expect, it } from "vitest";
import { fromPowerConfirm, holdMs, isActive, nextListen, soundFor, type ListenState } from "./listen";

const rec = (id: number, level?: number): ListenState => ({ id, mode: "dictation", phase: "recording", level });

describe("listen-state", () => {
  it("keeps_level_and_follows_phases", () => {
    let s = nextListen(null, rec(1));
    s = nextListen(s, rec(1, 0.4));
    expect(s?.level).toBe(0.4);
    s = nextListen(s, { id: 1, mode: "dictation", phase: "processing" });
    expect(s?.phase).toBe("processing");
    s = nextListen(s, { id: 1, mode: "dictation", phase: "done", text: "hola" });
    expect(s?.text).toBe("hola");
  });

  it("ignores_stale_sessions", () => {
    const s = nextListen(nextListen(null, rec(1)), rec(2));
    expect(nextListen(s, { id: 1, mode: "dictation", phase: "done", text: "viejo" })).toBe(s);
  });

  it("done_without_session_is_ignored", () => {
    expect(nextListen(null, { id: 3, mode: "lazo", phase: "done" })).toBeNull();
  });

  it("error_shows_even_without_session", () => {
    const s = nextListen(null, { id: 4, mode: "dictation", phase: "error", text: "Sin acceso al micrófono", action: "mic" });
    expect(s?.action).toBe("mic");
  });

  it("sound_on_phase_changes_only", () => {
    expect(soundFor(null, rec(1))).toBe("start");
    expect(soundFor(rec(1), rec(1, 0.3))).toBeNull();
    expect(soundFor(rec(1), { id: 1, mode: "dictation", phase: "processing" })).toBe("stop");
    expect(soundFor(null, { id: 2, mode: "dictation", phase: "error" })).toBe("error");
    expect(soundFor(rec(1), { id: 1, mode: "dictation", phase: "done" })).toBeNull();
  });
});

describe("lazo phases", () => {
  it("reply_shows_8_seconds_and_thinking_waits", () => {
    expect(holdMs({ id: 1, mode: "lazo", phase: "thinking" })).toBeNull();
    expect(holdMs({ id: 1, mode: "lazo", phase: "done", text: "Hola", reply: true })).toBe(8000);
    expect(holdMs({ id: 1, mode: "lazo", phase: "done", text: "No encontré «x»", action: "commands" })).toBe(6000);
    expect(holdMs({ id: 1, mode: "dictation", phase: "done", text: "hola" })).toBe(3000);
    expect(holdMs({ id: 1, mode: "dictation", phase: "error", text: "hola", action: "copy" })).toBe(20000);
  });

  it("power_confirm_becomes_a_confirm_phase", () => {
    const s = fromPowerConfirm({ id: 2, cmd: { System: "Sleep" }, text: "¿Suspender el equipo?" });
    expect(s).toMatchObject({ phase: "confirm", mode: "lazo", confirm: { System: "Sleep" } });
    expect(isActive(s)).toBe(true);
    expect(isActive({ id: 2, mode: "lazo", phase: "done" })).toBe(false);
  });
});
