# Logifex Protocol

[![CI](https://github.com/logifexglobal/logifex-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/logifexglobal/logifex-protocol/actions/workflows/ci.yml)

> **Pre-stable.** Everything in this repo is `0.x`. Breaking changes are
> expected. **Do not use in production.** This is for learning and
> experimentation until a `1.0.0` release.

Logifex Protocol is an architectural model, not a framework. It defines
what a small set of primitives are allowed to mean and what they are
explicitly forbidden from becoming — the technology underneath each one
is free to change without breaking the contract above it.

## Core Primitives (`@logifex-protocol/core`)

Five primitives, all dependency-free:

| Primitive | Defines |
|---|---|
| **Contract** | The shape/behavior/guarantees of an interface. Compile-time only in v1 — no bundled schema library. |
| **Event** | An immutable fact. `occurredAt` is business time, not construction time. |
| **EventBus** | The dispatch boundary. `publish()` means "accepted," never "all handlers completed." No delivery guarantee, no ordering guarantee — those are implementation concerns. |
| **Handler** | A reaction contract (`handle(event, context?)`). Not lifecycle-managed — a plain function is a valid Handler. |
| **Lifecycle** | `created → initializing → initialized → active → disposing → disposed`. Disposal is reachable from any non-disposed state and is idempotent. |

## Invariant (`@logifex-protocol/invariant`)

Invariant is **cross-cutting, not a sixth primitive** — it constrains
the five above rather than sitting beside them. A condition that must
remain true, with a graduated, one-way-by-default enforcement ladder:

```
documented → validated → enforced → runtime-enforced
```

Weakening an invariant's status requires an explicit, matching
`InvariantChangeRecord` — never a silent regression.

## Adapter (pattern, not a package)

A boundary component that translates between a Contract and an
external system. Not a sixth primitive, not a runtime package — a
documented pattern, formalized directly from a real implementation
rather than designed ahead of need. Lifecycle is optional (composed
only when real resources need it), substitutability is Contract-level
not identical-behavior, and provider errors resolve into the
Contract's own result vocabulary instead of being thrown. See
[`docs/ADAPTER.md`](docs/ADAPTER.md) for the full guarantees and the
evidence behind each one.

## Plugin

A declared, reviewable manifest for extending Logifex Protocol — schema,
parser, and Core-compatibility checks, with no runtime sandboxing claimed
in v1. See [`docs/PLUGIN.md`](docs/PLUGIN.md) for the full manifest shape
and what's deliberately deferred.

## Why a Protocol, not a framework

EventBus doesn't promise "at-least-once delivery" — that question only
makes sense relative to a specific implementation (in-memory, durable,
distributed), and promising one guarantee across all of them wouldn't
be careful, it would be dishonest about what the code can actually
keep. The Protocol defines what EventBus *means*; the guarantee comes
from whatever sits underneath it.

## Getting started

```bash
npm install
npm run build
npm test
```

## Packages

- `packages/core` — `@logifex-protocol/core`
- `packages/invariant` — `@logifex-protocol/invariant`

## License

MIT
