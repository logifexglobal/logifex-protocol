# @logifex-protocol/invariant

A governance layer for declaring invariants, tracking enforcement status,
and governing status changes. Independent of `@logifex-protocol/core`.

> **Pre-stable (`0.x`).** Breaking changes are expected. Not for production yet.

An Invariant is a condition that must remain true, regardless of
implementation. It is cross-cutting, not a sixth Core primitive — it
constrains Contract/Event/EventBus/Handler/Lifecycle, it doesn't sit
beside them.

## Install

```bash
npm install @logifex-protocol/invariant
```

## Enforcement ladder

```
documented → validated → enforced → runtime-enforced
```

Advancing is a one-way ratchet by default. Weakening (moving backward)
requires an explicit `InvariantChangeRecord` — a governed exception,
never a silent regression.

## `InvariantRegistry` — the runtime verifier

```ts
import { InvariantRegistry, InvariantViolation } from '@logifex-protocol/invariant';

const registry = new InvariantRegistry();

registry.register({
  id: 'SETTLE-003',
  name: 'Sufficient Balance',
  statement: 'An internal account must not go negative when a ledger entry is posted.',
  scope: { layers: ['Domain'] },
  severity: 'critical',
  currentStatus: 'runtime-enforced',
  targetStatus: 'runtime-enforced',
  ownership: { authority: 'Protocol', implementation: 'Ledger' },
});

// Always checks — does not consult the invariant's tracked status.
// "runtime-enforced" describes an invariant with a live enforce() call
// guarding it; it isn't a flag enforce() reads before deciding to fire.
registry.enforce('SETTLE-003', balance >= amount, { account, balance, amount });
// throws InvariantViolation if the condition is false
```

## Docs

Full repo and the other packages:
[github.com/logifexglobal/logifex-protocol](https://github.com/logifexglobal/logifex-protocol)

## License

MIT
