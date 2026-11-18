import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ALERT_AUTO_CLOSE_MS, useAutoClose } from "./useAutoClose";

afterEach(() => vi.useRealTimers());

describe("alert auto close", () => {
  it("folds_after_60_s", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    renderHook(() => useAutoClose("a1", close));
    vi.advanceTimersByTime(ALERT_AUTO_CLOSE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(ALERT_AUTO_CLOSE_MS).toBe(60_000);
  });

  it("paused_while_key_is_null_and_restarts_for_a_new_alert", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const { rerender } = renderHook(({ k }: { k: string | null }) => useAutoClose(k, close), { initialProps: { k: "a1" as string | null } });
    vi.advanceTimersByTime(30_000);
    rerender({ k: null });
    vi.advanceTimersByTime(60_000);
    expect(close).not.toHaveBeenCalled();
    rerender({ k: "a2" });
    vi.advanceTimersByTime(60_000);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
