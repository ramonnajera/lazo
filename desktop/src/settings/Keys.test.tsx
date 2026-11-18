import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Keys from "./Keys";
import type { Config } from "../config/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.mocked(invoke).mockReset();
});

const config = {
  keys: { dictation: "RightCtrl", lazo: "RightAlt", openIsland: "Ctrl+Alt+Space", chat: "" },
  dictation: { handsFreeDoubleTap: true },
} as unknown as Config;

const lastSuspended = () => {
  const calls = vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "set_hotkeys_suspended");
  return (calls[calls.length - 1]?.[1] as { suspended: boolean } | undefined)?.suspended;
};

describe("keys settings", () => {
  it("closing_the_window_while_capturing_resumes_hotkeys", () => {
    vi.mocked(invoke).mockResolvedValue(null);
    render(<Keys config={config} saveConfig={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("Presiona la nueva tecla…")).toBeTruthy();
    expect(lastSuspended()).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(screen.queryByText("Presiona la nueva tecla…")).toBeNull();
    expect(lastSuspended()).toBe(false);
  });
});
