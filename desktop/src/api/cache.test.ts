import { beforeEach, describe, expect, it } from "vitest";
import { cached } from "./cache";

beforeEach(() => localStorage.clear());

describe("cached", () => {
  it("devuelve datos frescos y los guarda", async () => {
    const r = await cached("k", async () => ({ a: 1 }));
    expect(r.data).toEqual({ a: 1 });
    expect(r.stale).toBe(false);
    expect(r.fetchedAt).toBeGreaterThan(0);
  });

  it("cached_returns_stale_on_offline", async () => {
    const fresh = await cached("k", async () => ({ a: 1 }));
    const r = await cached("k", async () => {
      throw { kind: "offline", message: "sin red" };
    });
    expect(r.stale).toBe(true);
    expect(r.data).toEqual({ a: 1 });
    expect(r.fetchedAt).toBe(fresh.fetchedAt);
  });

  it("cached_rethrows_without_cache", async () => {
    await expect(
      cached("k", async () => {
        throw { kind: "offline", message: "sin red" };
      }),
    ).rejects.toMatchObject({ kind: "offline" });
  });

  it("no usa caché para errores que no son offline", async () => {
    await cached("k", async () => 1);
    await expect(
      cached("k", async () => {
        throw { kind: "unauthorized", message: "x" };
      }),
    ).rejects.toMatchObject({ kind: "unauthorized" });
  });
});
