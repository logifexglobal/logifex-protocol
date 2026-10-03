/**
 * Invariant
 * ---------
 * A condition that must remain true within a defined scope of the
 * Logifex system, regardless of implementation, execution path, or
 * extension mechanism.
 *
 * Invariant is cross-cutting, not a sixth Core primitive: it does not
 * sit beside Contract/Event/EventBus/Handler/Lifecycle as a runtime
 * peer, it constrains them. Contract answers "what shape/guarantees
 * does this interface have"; Invariant answers "what must always
 * remain true, no matter which implementation exists." That's why
 * this lives in its own package, dependency-free of Core: Core needs
 * these five primitives to function, it does not need this bookkeeping
 * to run.
 *
 * Enforcement status is a one-way ratchet by default:
 *   documented -> validated -> enforced -> runtime-enforced
 * Advancing (even to enforced/runtime-enforced) requires the caller to
 * explicitly call advance() — never silently automatic — because a
 * promotion is a real behavior change (it can start blocking builds or
 * operations). Weakening (moving backward) is only ever possible via
 * weaken() with a matching InvariantChangeRecord — a governed,
 * auditable exception, not a silent regression.
 */

export type EnforcementStatus =
  | "documented"
  | "validated"
  | "enforced"
  | "runtime-enforced";

const RANK: Record<EnforcementStatus, number> = {
  documented: 0,
  validated: 1,
  enforced: 2,
  "runtime-enforced": 3,
};

const ORDER: EnforcementStatus[] = [
  "documented",
  "validated",
  "enforced",
  "runtime-enforced",
];

export type Severity = "critical" | "high" | "medium" | "advisory";

export interface InvariantScope {
  readonly layers?: readonly string[];
  readonly components?: readonly string[];
}

export interface InvariantOwnership {
  readonly authority: string;
  readonly implementation: string;
}

export interface InvariantDefinition {
  readonly id: string;
  readonly name: string;
  readonly statement: string;
  readonly scope: InvariantScope;
  readonly severity: Severity;
  readonly currentStatus: EnforcementStatus;
  readonly targetStatus: EnforcementStatus;
  readonly ownership: InvariantOwnership;
}

export interface InvariantChangeRecord {
  readonly invariantId: string;
  readonly reason: string;
  readonly impact: string;
  readonly approvedBy: string;
  readonly fromStatus: EnforcementStatus;
  readonly toStatus: EnforcementStatus;
}

export class InvariantGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantGovernanceError";
  }
}

export class Invariant {
  readonly #definition: InvariantDefinition;
  readonly #history: InvariantChangeRecord[] = [];

  constructor(definition: InvariantDefinition) {
    this.#definition = { ...definition };
  }

  get definition(): Readonly<InvariantDefinition> {
    return this.#definition;
  }

  get status(): EnforcementStatus {
    return this.#definition.currentStatus;
  }

  get history(): readonly InvariantChangeRecord[] {
    return this.#history;
  }

  /** Moves status forward one or more steps toward targetStatus. */
  advance(to: EnforcementStatus): void {
    if (RANK[to] <= RANK[this.#definition.currentStatus]) {
      throw new InvariantGovernanceError(
        `advance() must move forward: ${this.#definition.currentStatus} -> ${to} is not an advance`
      );
    }
    (this.#definition as { currentStatus: EnforcementStatus }).currentStatus = to;
  }

  /** Moves status backward. Requires a matching, governed change record. */
  weaken(record: InvariantChangeRecord): void {
    if (record.invariantId !== this.#definition.id) {
      throw new InvariantGovernanceError(
        `change record is for ${record.invariantId}, not ${this.#definition.id}`
      );
    }
    if (record.fromStatus !== this.#definition.currentStatus) {
      throw new InvariantGovernanceError(
        `change record expects current status ${record.fromStatus}, but it is ${this.#definition.currentStatus}`
      );
    }
    if (RANK[record.toStatus] >= RANK[record.fromStatus]) {
      throw new InvariantGovernanceError(
        `weaken() must move backward: ${record.fromStatus} -> ${record.toStatus} is not a weakening`
      );
    }
    (this.#definition as { currentStatus: EnforcementStatus }).currentStatus = record.toStatus;
    this.#history.push(record);
  }
}

export function nextStatus(current: EnforcementStatus): EnforcementStatus | null {
  const i = ORDER.indexOf(current);
  return i < ORDER.length - 1 ? ORDER[i + 1]! : null;
}

/**
 * InvariantViolation
 * -------------------
 * Thrown by InvariantRegistry.enforce() when a checked condition is
 * false. Carries the invariant's id and statement so the failure is
 * attributable to a specific tracked Invariant, not just a generic
 * assertion error.
 */
export class InvariantViolation extends Error {
  constructor(
    readonly invariantId: string,
    statement: string,
    readonly details?: Record<string, unknown>
  ) {
    super(`[${invariantId}] ${statement}`);
    this.name = "InvariantViolation";
  }
}

export class InvariantRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantRegistryError";
  }
}

/**
 * InvariantRegistry
 * -----------------
 * A catalog of Invariants referenced by id. Composed of Invariant
 * instances internally — advance()/weaken() delegate to the already-
 * governed logic on Invariant rather than re-implementing it.
 *
 * enforce() always checks the given condition and throws
 * InvariantViolation when false, regardless of tracked status. Status
 * is separate, descriptive governance metadata — not a gate enforce()
 * reads. "runtime-enforced" describes an invariant that has a live
 * enforce() call guarding it; it isn't a flag enforce() checks first.
 */
export class InvariantRegistry {
  readonly #invariants = new Map<string, Invariant>();

  register(definition: InvariantDefinition): Invariant {
    if (this.#invariants.has(definition.id)) {
      throw new InvariantRegistryError(`Invariant ${definition.id} is already registered`);
    }
    const invariant = new Invariant(definition);
    this.#invariants.set(definition.id, invariant);
    return invariant;
  }

  get(id: string): Invariant {
    const invariant = this.#invariants.get(id);
    if (!invariant) {
      throw new InvariantRegistryError(`Unknown invariant: ${id}`);
    }
    return invariant;
  }

  all(): readonly Invariant[] {
    return [...this.#invariants.values()];
  }

  advance(id: string, to: EnforcementStatus): void {
    this.get(id).advance(to);
  }

  weaken(id: string, record: InvariantChangeRecord): void {
    this.get(id).weaken(record);
  }

  enforce(id: string, ok: boolean, details?: Record<string, unknown>): void {
    const invariant = this.get(id);
    if (!ok) {
      throw new InvariantViolation(id, invariant.definition.statement, details);
    }
  }
}