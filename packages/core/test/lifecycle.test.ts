import { describe, it, expect, vi } from "vitest";
import { Lifecycle, LifecycleTransitionError } from "../src/lifecycle.js";

describe("Lifecycle", () => {
  it("progresses through the normal sequence", async () => {
    const lc = new Lifecycle();
    expect(lc.phase).toBe("created");
    await lc.start();
    expect(lc.phase).toBe("active");
  });

  it("start() always lands on active with no intermediate phase skipped or stuck", async () => {
    const seen: string[] = [];
    const lc = new Lifecycle({
      onInitialize: () => { seen.push(lc.phase); },
      onActivate: () => { seen.push(lc.phase); },
    });
    await lc.start();
    expect(seen).toEqual(["initializing", "initialized"]);
    expect(lc.phase).toBe("active");
  });

  it("disposal is reachable from created (never initialized)", async () => {
    const lc = new Lifecycle();
    expect(lc.phase).toBe("created");
    await lc.dispose();
    expect(lc.phase).toBe("disposed");
  });

  it("disposal is safe from a partially-initialized state", async () => {
    const onInitialize = vi.fn(async () => {
      throw new Error("boom");
    });
    const onDispose = vi.fn();
    const lc = new Lifecycle({ onInitialize, onDispose });

    await expect(lc.start()).rejects.toThrow("boom");
    // start() threw mid-initializing; dispose must still work cleanly.
    await lc.dispose();
    expect(lc.phase).toBe("disposed");
    expect(onDispose).toHaveBeenCalledOnce();
  });

  it("dispose() is idempotent — repeat calls are no-ops, not errors", async () => {
    const onDispose = vi.fn();
    const lc = new Lifecycle({ onDispose });
    await lc.start();

    await Promise.all([lc.dispose(), lc.dispose(), lc.dispose()]);
    expect(lc.phase).toBe("disposed");
    expect(onDispose).toHaveBeenCalledOnce();
  });

  it("disposed is terminal — cannot start() after disposal", async () => {
    const lc = new Lifecycle();
    await lc.dispose();
    await expect(lc.start()).rejects.toThrow(LifecycleTransitionError);
  });

  it("a concurrent dispose() during start() short-circuits before active", async () => {
    let resolveInit!: () => void;
    const onInitialize = () => new Promise<void>((r) => (resolveInit = r));
    const onActivate = vi.fn();
    const lc = new Lifecycle({ onInitialize, onActivate });

    const starting = lc.start();
    const disposing = lc.dispose();
    resolveInit();
    await Promise.all([starting, disposing]);

    expect(lc.phase).toBe("disposed");
    expect(onActivate).not.toHaveBeenCalled();
  });
});
