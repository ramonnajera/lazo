import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { refreshIfOlderThan, refreshKeys, usePanelData } from "./usePanelData";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({ connection: { refreshSec: 60 }, general: {} }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

function Probe({ k, fetcher, id }: { k: string; fetcher: () => Promise<string>; id: string }) {
  const { data, loading } = usePanelData(k, fetcher);
  return <div data-testid={id}>{loading ? "cargando" : data}</div>;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePanelData", () => {
  it("shares_one_subscription_per_key", async () => {
    const fetcher = vi.fn().mockResolvedValue("A");
    render(
      <>
        <Probe k="shared" fetcher={fetcher} id="one" />
        <Probe k="shared" fetcher={fetcher} id="two" />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("one").textContent).toBe("A");
    expect(screen.getByTestId("two").textContent).toBe("A");
    fetcher.mockResolvedValue("B");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("one").textContent).toBe("B");
    expect(screen.getByTestId("two").textContent).toBe("B");
  });

  it("seeds_from_cache_without_loading_flash", () => {
    localStorage.setItem("lazo-cache:seeded", JSON.stringify({ data: "cache", fetchedAt: 1 }));
    render(<Probe k="seeded" fetcher={() => new Promise(() => {})} id="x" />);
    expect(screen.getByTestId("x").textContent).toBe("cache");
  });

  it("reload_during_inflight_queues_one_fresh_fetch", async () => {
    const resolvers: Array<(v: string) => void> = [];
    const fetcher = vi.fn(() => new Promise<string>((res) => resolvers.push(res)));
    let reload: () => void = () => {};
    function P() {
      const p = usePanelData("queued", fetcher);
      reload = p.reload;
      return <div data-testid="q">{p.loading ? "cargando" : p.data}</div>;
    }
    render(<P />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // petición en vuelo (datos previos a la mutación)
    act(() => {
      reload();
      reload();
      refreshKeys("queued");
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // aún no: espera a que termine la actual
    await act(async () => {
      resolvers[0]("viejo");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(2); // exactamente una nueva, no tres
    await act(async () => {
      resolvers[1]("nuevo");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByTestId("q").textContent).toBe("nuevo");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("refresh_keys_also_covers_suffixed_keys_but_not_lookalikes", async () => {
    const month = vi.fn().mockResolvedValue("mes");
    const other = vi.fn().mockResolvedValue("otro");
    render(
      <>
        <Probe k="cal:2026-11" fetcher={month} id="m" />
        <Probe k="calc" fetcher={other} id="o" />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      refreshKeys("cal");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(month).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(1);
  });
  it("refresh_if_older_than_skips_fresh_keys", async () => {
    const fetcher = vi.fn().mockResolvedValue("v1");
    render(<Probe k="aging" fetcher={fetcher} id="a" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Datos de hace 5 s: no se refrescan con umbral de 15 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    act(() => refreshIfOlderThan(["aging"], 15_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Con 20 s de antigüedad sí; claves desconocidas se ignoran.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    fetcher.mockResolvedValue("v2");
    act(() => refreshIfOlderThan(["aging", "nope"], 15_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("a").textContent).toBe("v2");
  });

  it("refresh_if_older_than_does_nothing_while_inflight", async () => {
    const resolvers: Array<(v: string) => void> = [];
    const fetcher = vi.fn(() => new Promise<string>((res) => resolvers.push(res)));
    render(<Probe k="busy" fetcher={fetcher} id="b" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => refreshIfOlderThan(["busy"], 0));
    await act(async () => {
      resolvers[0]("x");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // sin cola extra
  });
});
