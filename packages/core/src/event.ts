/**
 * Event
 * -----
 * An immutable, typed payload representing something that happened in
 * the system. A fact, not a request — it doesn't ask for something to
 * happen, it records that something already did.
 *
 * occurredAt is business/domain occurrence time, supplied by the
 * producer. It may be earlier than when this Event object was
 * constructed (delayed webhooks, historical imports) — it is NOT a
 * record of when the Event was created, published, or dispatched.
 * Those are separate infrastructure-level facts and are deliberately
 * not part of the Core Event contract in v1.
 *
 * timestamp/occurredAt is metadata only. It is explicitly NOT an
 * ordering guarantee — clock skew across producers makes wall-clock
 * time unreliable for ordering. If ordering is needed, it is a
 * separate, explicit EventBus-level capability, never assumed from
 * occurredAt.
 */

export interface Event<Payload = unknown> {
  readonly id: string;
  readonly type: string;
  /**
   * ISO 8601 UTC timestamp (e.g. "2026-09-27T10:00:00.000Z"). A string,
   * not a Date: Events are facts that cross boundaries (persistence,
   * JSON over HTTP), a Date does not survive serialization, and a Date
   * inside a frozen Event could still be mutated via setTime() — a
   * string cannot.
   */
  readonly occurredAt: string;
  readonly payload: Payload;
}

export interface CreateEventInput<Payload = unknown> {
  type: string;
  payload: Payload;
  /** Defaults to now. Set explicitly for backdated/imported events.
   * A Date is accepted for convenience and normalized to an ISO string. */
  occurredAt?: string | Date;
  /** Defaults to a generated id. */
  id?: string;
}

let sequence = 0;
function generateId(): string {
  sequence += 1;
  return `evt_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

function normalizeOccurredAt(value: string | Date | undefined): string {
  if (value === undefined) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid occurredAt: ${String(value)}`);
  }
  return value instanceof Date ? date.toISOString() : value;
}

/**
 * Constructs an immutable Event. Object.freeze() enforces immutability
 * at runtime, not just at the type level.
 */
export function createEvent<Payload>(
  input: CreateEventInput<Payload>
): Event<Payload> {
  const event: Event<Payload> = {
    id: input.id ?? generateId(),
    type: input.type,
    occurredAt: normalizeOccurredAt(input.occurredAt),
    payload: input.payload,
  };
  return Object.freeze(event);
}

/**
 * EventContext
 * ------------
 * Execution/propagation metadata that travels alongside an Event
 * without mutating it. Deliberately narrow: only correlation and
 * causal lineage. tenantId/actorId (authorization concerns) and
 * traceId/spanId (observability concerns) are intentionally excluded
 * from Core — they belong to a future Identity/Policy concept and an
 * observability adapter, respectively. Context must not become a
 * dumping ground.
 */
export interface EventContext {
  /** Groups related activity across multiple Events (e.g. one request/saga). */
  readonly correlationId?: string;
  /** The immediate causal predecessor of this Event, if any. */
  readonly causationId?: string;
}
