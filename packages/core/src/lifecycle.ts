/**
 * Lifecycle
 * ---------
 * The defined phases a component goes through from creation to
 * destruction.
 *
 * Guarantee (locked wording):
 * Components follow a defined lifecycle progression and cannot bypass
 * required forward lifecycle phases during normal activation. Disposal
 * is a terminal cleanup transition that may be entered from any
 * non-disposed lifecycle state.
 *
 * Normal progression:
 *   created -> initializing -> initialized -> active -> disposing -> disposed
 *
 * Failure transition:
 *   A component that fails during initialization or operation MUST NOT
 *   enter a later operational phase solely to satisfy lifecycle
 *   ordering. It MAY transition directly to `disposing` for cleanup —
 *   disposal must tolerate partial initialization (you cannot fail to
 *   release a resource you never acquired).
 *
 * Terminal guarantee:
 *   `disposed` cannot transition anywhere else. Repeat dispose() calls
 *   are idempotent no-ops, not errors — double-dispose is a common,
 *   legitimate real-world path (parent teardown + error handler both
 *   calling it), not a bug to punish.
 */

export type LifecyclePhase =
  | "created"
  | "initializing"
  | "initialized"
  | "active"
  | "disposing"
  | "disposed";

const NEXT: Record<LifecyclePhase, readonly LifecyclePhase[]> = {
  created: ["initializing", "disposing"],
  initializing: ["initialized", "disposing"],
  initialized: ["active", "disposing"],
  active: ["disposing"],
  disposing: ["disposed"],
  disposed: [],
};

export class LifecycleTransitionError extends Error {
  constructor(from: LifecyclePhase, to: LifecyclePhase) {
    super(`Invalid lifecycle transition: ${from} -> ${to}`);
    this.name = "LifecycleTransitionError";
  }
}

export interface LifecycleHooks {
  onInitialize?: () => void | Promise<void>;
  onActivate?: () => void | Promise<void>;
  onDispose?: () => void | Promise<void>;
}

export class Lifecycle {
  #phase: LifecyclePhase = "created";
  #disposePromise: Promise<void> | null = null;
  readonly #hooks: LifecycleHooks;

  constructor(hooks: LifecycleHooks = {}) {
    this.#hooks = hooks;
  }

  get phase(): LifecyclePhase {
    return this.#phase;
  }

  #transition(to: LifecyclePhase): void {
    if (!NEXT[this.#phase].includes(to)) {
      throw new LifecycleTransitionError(this.#phase, to);
    }
    this.#phase = to;
  }

  /** Runs created -> initializing -> initialized -> active. */
  async start(): Promise<void> {
    if (this.#phase !== "created") {
      throw new LifecycleTransitionError(this.#phase, "initializing");
    }
    this.#transition("initializing");
    await this.#hooks.onInitialize?.();

    // dispose() may have been called concurrently during initialize(),
    // and may have already run to completion (not just reached
    // "disposing") before this resumes — check that phase is still
    // exactly where this left it, not just "not disposing".
    if ((this.#phase as LifecyclePhase) !== "initializing") return;

    this.#transition("initialized");
    await this.#hooks.onActivate?.();

    if ((this.#phase as LifecyclePhase) !== "initialized") return;

    this.#transition("active");
  }

  /** Reachable from any non-disposed state. Idempotent. */
  async dispose(): Promise<void> {
    if (this.#phase === "disposed") return;
    if (this.#disposePromise) return this.#disposePromise;

    this.#disposePromise = (async () => {
      this.#transition("disposing");
      await this.#hooks.onDispose?.();
      this.#transition("disposed");
    })();

    return this.#disposePromise;
  }
}
