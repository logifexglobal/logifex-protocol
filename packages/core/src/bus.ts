/**
 * EventBus
 * --------
 * The protocol-defined dispatch boundary through which Events are
 * published and delivered to registered Handlers.
 *
 * publish() means "accepted for dispatch" — it never means "every
 * Handler has completed." Four distinct stages exist conceptually:
 *   Publication (accepted?) -> Dispatch (delivered?) ->
 *   Execution (handler ran?) -> Outcome (what happened?)
 * EventBus owns Publication/Dispatch only. Execution/Outcome
 * reporting is deliberately out of Core scope — building that in
 * would make EventBus responsible for retries, persistence, and an
 * internal observability plane it should never own.
 *
 * No default ordering guarantee. Registration order must never
 * silently become a business dependency. Ordering, if ever needed,
 * is an explicit opt-in capability layered on top, not baseline
 * behavior.
 *
 * One Handler failing must not block other Handlers from receiving
 * the same Event — failures are isolated per-Handler.
 *
 * Delivery guarantees (at-least-once, exactly-once, etc.) are NOT
 * promised by Core. This is the reference in-memory implementation:
 * process-local, best-effort, synchronous acceptance. A durable or
 * distributed EventBus is a different implementation of the same
 * contract, not a different contract.
 *
 * EventBus explicitly does NOT own: business logic, domain state,
 * persistence, broker technology, retry strategy, authorization, or
 * global ordering.
 */

import { Lifecycle, type LifecyclePhase } from "./lifecycle.js";
import type { Event, EventContext } from "./event.js";

export interface PublishResult {
  readonly accepted: boolean;
  readonly eventId: string;
}

export interface EventHandler<E extends Event = Event> {
  handle(event: E, context?: EventContext): Promise<void>;
}

/** Wraps a plain function as a Handler. Handler is a contract, not a
 * lifecycle-managed entity — a stateless function is a fully valid
 * Handler. Lifecycle belongs to whatever *owns* the Handler (a
 * Component or Plugin), never to the Handler itself. */
export function handlerFrom<E extends Event = Event>(
  fn: (event: E, context?: EventContext) => void | Promise<void>
): EventHandler<E> {
  return { handle: async (event, context) => { await fn(event, context); } };
}

/** Subscribe to this type to receive every Event, regardless of type. */
export const WILDCARD = "*";

export type HandlerErrorListener = (error: unknown, event: Event, type: string) => void;

export class EventBus {
  readonly #lifecycle = new Lifecycle();
  readonly #handlers = new Map<string, Set<EventHandler<any>>>();
  readonly #onHandlerError?: HandlerErrorListener;
  readonly #inFlight = new Set<Promise<void>>();

  constructor(options: { onHandlerError?: HandlerErrorListener } = {}) {
    this.#onHandlerError = options.onHandlerError;
  }

  get phase(): LifecyclePhase {
    return this.#lifecycle.phase;
  }

  async start(): Promise<void> {
    await this.#lifecycle.start();
  }

  async dispose(): Promise<void> {
    await this.#lifecycle.dispose();
  }

  /** Registration is deliberately minimal: event type + handler,
   * nothing else. Concurrency/failure/ordering policy is dispatcher
   * configuration, not something a Handler declares about itself. */
  subscribe<E extends Event>(type: string, handler: EventHandler<E>): () => void {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  async publish<E extends Event>(
    event: E,
    context?: EventContext
  ): Promise<PublishResult> {
    if (this.#lifecycle.phase !== "active") {
      return { accepted: false, eventId: event.id };
    }

    // Handlers subscribed to "*" observe every Event (audit/logging use
    // cases). An Event whose own type is literally "*" is not
    // double-dispatched.
    const targets = [
      ...(this.#handlers.get(event.type) ?? []),
      ...(event.type === WILDCARD ? [] : (this.#handlers.get(WILDCARD) ?? [])),
    ];
    if (targets.length > 0) {
      for (const handler of targets) {
        // Dispatch is independent per-handler: one rejection must not
        // affect the publisher or any other handler.
        const dispatch: Promise<void> = Promise.resolve()
          .then(() => handler.handle(event, context))
          .catch((error) => this.#onHandlerError?.(error, event, event.type))
          .finally(() => { this.#inFlight.delete(dispatch); });
        this.#inFlight.add(dispatch);
      }
    }

    return { accepted: true, eventId: event.id };
  }

  /**
   * Resolves once every Handler dispatch currently in flight has
   * settled (succeeded or failed).
   *
   * This is a test/observability convenience, not part of the
   * Contract-facing publish() guarantee — publish() itself never
   * awaits this, since publish() means "accepted for dispatch," not
   * "handlers completed." Only dispatches already in flight at the
   * moment drain() is called are awaited; a handler triggered after
   * drain() begins is not included.
   */
  async drain(): Promise<void> {
    await Promise.all(this.#inFlight);
  }
}
