import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue("") }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const { typingIn } = await import("./Island");

afterEach(cleanup);

describe("typingIn", () => {
  it("text_field_inside_the_island_counts_as_typing", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { container } = render(
      <div>
        <div className="isl">
          <input aria-label="chat" />
          <textarea aria-label="nota" />
          <input type="checkbox" aria-label="chk" />
          <button>b</button>
        </div>
        <input aria-label="fuera" />
      </div>,
    );
    const box = container.querySelector(".isl") as HTMLElement;
    const el = (sel: string) => container.querySelector(sel) as HTMLElement;
    el(".isl input:not([type])").focus();
    expect(typingIn(box)).toBe(true);
    el("textarea").focus();
    expect(typingIn(box)).toBe(true);
    el("input[type=checkbox]").focus();
    expect(typingIn(box)).toBe(false);
    el("button").focus();
    expect(typingIn(box)).toBe(false);
    el("[aria-label=fuera]").focus();
    expect(typingIn(box)).toBe(false);
    // Clic en otra ventana: sin foco ya no cuenta.
    el(".isl input:not([type])").focus();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    expect(typingIn(box)).toBe(false);
  });
});
