import { describe, expect, it } from "vitest";
import { bindingFromKey, comboFromKey, conflicts, type KeyLike } from "./keyCapture";

const k = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe("captura de teclas", () => {
  it("binding_from_right_modifiers", () => {
    expect(bindingFromKey(k("ControlRight", { ctrlKey: true }))).toBe("RightCtrl");
    expect(bindingFromKey(k("AltRight", { altKey: true }))).toBe("RightAlt");
    expect(bindingFromKey(k("ShiftRight", { shiftKey: true }))).toBe("RightShift");
    expect(bindingFromKey(k("MetaLeft", { ctrlKey: true, metaKey: true }))).toBe("CtrlWin");
    expect(bindingFromKey(k("ControlLeft", { ctrlKey: true, metaKey: true }))).toBe("CtrlWin");
    expect(bindingFromKey(k("KeyA"))).toBeNull();
    expect(bindingFromKey(k("ControlLeft", { ctrlKey: true }))).toBeNull();
  });

  it("combo_needs_modifier_and_key", () => {
    expect(comboFromKey(k("Space", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+Space");
    expect(comboFromKey(k("KeyC", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+C");
    expect(comboFromKey(k("Digit1", { shiftKey: true, metaKey: true }))).toBe("Shift+Super+1");
    expect(comboFromKey(k("F5", { ctrlKey: true }))).toBe("Ctrl+F5");
    expect(comboFromKey(k("KeyC"))).toBeNull();
    expect(comboFromKey(k("ControlLeft", { ctrlKey: true }))).toBeNull();
  });

  it("conflicts_detects_duplicates", () => {
    const keys = { dictation: "RightCtrl", lazo: "RightAlt", openIsland: "Ctrl+Alt+Space", chat: "Ctrl+Alt+C" };
    expect(conflicts(keys, "lazo", "RightCtrl")).toBe("dictation");
    expect(conflicts(keys, "chat", "ctrl+alt+space")).toBe("openIsland");
    expect(conflicts(keys, "chat", "Ctrl+Alt+C")).toBeNull();
  });
});
