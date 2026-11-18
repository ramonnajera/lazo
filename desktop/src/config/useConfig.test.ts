import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { Config } from "./types";

const handlers: Record<string, (e: { payload: unknown }) => void> = {};
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => {
    handlers[name] = cb;
    return () => {};
  }),
}));

import { useConfig } from "./useConfig";

const base = { keys: { lazo: "RightAlt" }, connection: { refreshSec: 60 } } as unknown as Config;

describe("useConfig", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(base);
  });

  it("carga la configuración al montar", async () => {
    const { result } = renderHook(() => useConfig());
    expect(result.current.config).toBeNull();
    await waitFor(() => expect(result.current.config).toEqual(base));
    expect(invoke).toHaveBeenCalledWith("get_config");
  });

  it("se actualiza con config-changed", async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(base));
    const next = { ...base, keys: { lazo: "RightShift" } } as unknown as Config;
    act(() => handlers["config-changed"]({ payload: next }));
    expect(result.current.config).toEqual(next);
  });

  it("saveConfig invoca set_config", async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(base));
    await act(() => result.current.saveConfig(base));
    expect(invoke).toHaveBeenCalledWith("set_config", { cfg: base });
  });
});
