import { describe, it, expect } from "vitest";
import { Invariant, InvariantGovernanceError } from "../src/invariant.js";

function baseDefinition() {
  return {
    id: "INV-0001",
    name: "Core Isolation",
    statement: "Core must not directly depend on external UI implementations.",
    scope: { layers: ["Core"] as const },
    severity: "critical" as const,
    currentStatus: "documented" as const,
    targetStatus: "enforced" as const,
    ownership: { authority: "Protocol", implementation: "Core Team" },
  };
}

describe("Invariant", () => {
  it("advances forward through the status ladder", () => {
    const inv = new Invariant(baseDefinition());
    inv.advance("validated");
    expect(inv.status).toBe("validated");
    inv.advance("enforced");
    expect(inv.status).toBe("enforced");
  });

  it("rejects advance() that doesn't actually move forward", () => {
    const inv = new Invariant(baseDefinition());
    inv.advance("validated");
    expect(() => inv.advance("documented")).toThrow(InvariantGovernanceError);
    expect(() => inv.advance("validated")).toThrow(InvariantGovernanceError);
  });

  it("rejects weaken() without a matching InvariantChangeRecord", () => {
    const inv = new Invariant(baseDefinition());
    inv.advance("validated");
    inv.advance("enforced");

    expect(() =>
      inv.weaken({
        invariantId: "INV-9999",
        reason: "wrong id",
        impact: "n/a",
        approvedBy: "someone",
        fromStatus: "enforced",
        toStatus: "documented",
      })
    ).toThrow(InvariantGovernanceError);
  });

  it("allows weaken() with a valid, matching change record and records history", () => {
    const inv = new Invariant(baseDefinition());
    inv.advance("validated");
    inv.advance("enforced");

    inv.weaken({
      invariantId: "INV-0001",
      reason: "found to be overly restrictive for adapter authors",
      impact: "removes build-time blocking; audits move to code review",
      approvedBy: "protocol-maintainers",
      fromStatus: "enforced",
      toStatus: "validated",
    });

    expect(inv.status).toBe("validated");
    expect(inv.history).toHaveLength(1);
  });

  it("rejects a change record whose fromStatus doesn't match current status", () => {
    const inv = new Invariant(baseDefinition());
    expect(() =>
      inv.weaken({
        invariantId: "INV-0001",
        reason: "stale record",
        impact: "n/a",
        approvedBy: "someone",
        fromStatus: "enforced",
        toStatus: "documented",
      })
    ).toThrow(InvariantGovernanceError);
  });
});

import { InvariantRegistry, InvariantViolation, InvariantRegistryError } from "../src/invariant.js";

describe("InvariantRegistry", () => {
  function registryWithSettle003() {
    const registry = new InvariantRegistry();
    registry.register({
      id: "SETTLE-003",
      name: "Sufficient Balance",
      statement: "An internal account must not go negative when a ledger entry is posted.",
      scope: { layers: ["Domain"] },
      severity: "critical",
      currentStatus: "runtime-enforced",
      targetStatus: "runtime-enforced",
      ownership: { authority: "Protocol", implementation: "Ledger" },
    });
    return registry;
  }

  it("enforce() throws InvariantViolation, attributed to the invariant, when the condition is false", () => {
    const registry = registryWithSettle003();
    expect(() =>
      registry.enforce("SETTLE-003", false, { account: "merchant:m1", balance: 0, amount: 500 })
    ).toThrow(InvariantViolation);

    try {
      registry.enforce("SETTLE-003", false, { account: "merchant:m1" });
    } catch (err) {
      expect(err).toBeInstanceOf(InvariantViolation);
      expect((err as InvariantViolation).invariantId).toBe("SETTLE-003");
      expect((err as InvariantViolation).message).toContain("SETTLE-003");
    }
  });

  it("enforce() does not throw when the condition is true", () => {
    const registry = registryWithSettle003();
    expect(() => registry.enforce("SETTLE-003", true)).not.toThrow();
  });

  it("enforce() throws even for a documented (not yet enforced) invariant — status is metadata, not a gate", () => {
    const registry = new InvariantRegistry();
    registry.register({
      id: "INV-DRAFT",
      name: "Draft",
      statement: "Still being worked out.",
      scope: {},
      severity: "advisory",
      currentStatus: "documented",
      targetStatus: "enforced",
      ownership: { authority: "Protocol", implementation: "TBD" },
    });
    expect(() => registry.enforce("INV-DRAFT", false)).toThrow(InvariantViolation);
  });

  it("rejects registering the same id twice", () => {
    const registry = registryWithSettle003();
    expect(() =>
      registry.register({
        id: "SETTLE-003",
        name: "dup",
        statement: "dup",
        scope: {},
        severity: "advisory",
        currentStatus: "documented",
        targetStatus: "documented",
        ownership: { authority: "x", implementation: "y" },
      })
    ).toThrow(InvariantRegistryError);
  });

  it("throws a clear error for an unknown id", () => {
    const registry = new InvariantRegistry();
    expect(() => registry.enforce("NOPE", false)).toThrow(InvariantRegistryError);
    expect(() => registry.get("NOPE")).toThrow(InvariantRegistryError);
  });

  it("advance()/weaken() on the registry delegate to the underlying Invariant", () => {
    const registry = registryWithSettle003();
    registry.advance; // ensure it exists on type
    const already = registry.get("SETTLE-003");
    expect(already.status).toBe("runtime-enforced");

    registry.weaken("SETTLE-003", {
      invariantId: "SETTLE-003",
      reason: "found a false positive in edge case X",
      impact: "temporarily downgraded to validated while investigating",
      approvedBy: "protocol-maintainers",
      fromStatus: "runtime-enforced",
      toStatus: "validated",
    });
    expect(registry.get("SETTLE-003").status).toBe("validated");
  });

  it("all() lists every registered invariant", () => {
    const registry = registryWithSettle003();
    expect(registry.all()).toHaveLength(1);
    expect(registry.all()[0]!.definition.id).toBe("SETTLE-003");
  });
});
