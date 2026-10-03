# @logifex-protocol/core

Contract, Event, EventBus, Handler, Lifecycle. Zero runtime dependencies.

> **Pre-stable (`0.x`).** Breaking changes are expected. Not for production yet.

Logifex Protocol defines contracts and semantics, never implementation
or technology. Each primitive states what it guarantees — and just as
importantly, what it deliberately does not.

## Install

```bash
npm install @logifex-protocol/core
```

## The five primitives

- **Contract** — a formal specification of shape, behavior, and
  guarantees. Compile-time only in v1; `defineContract()` gives it a
  stable name and version without a runtime schema library.
- **Event** — an immutable fact: `{ id, type, occurredAt, payload }`.
  `occurredAt` is business/domain time (producer-supplied, may be
  backdated), not construction time.
- **EventBus** — `publish()` means "accepted for dispatch," never "all
  handlers completed." No delivery guarantee, no ordering guarantee —
  those are implementation concerns. `drain()` resolves once in-flight
  dispatches settle; `subscribe("*", ...)` observes every event.
- **Handler** — `{ handle(event, context?) }`. A contract, not a
  lifecycle-managed entity — a plain function is a valid Handler.
- **Lifecycle** — `created → initializing → initialized → active →
  disposing → disposed`. Disposal is reachable from any non-disposed
  state and is idempotent.

## Example

```ts
import { createEvent, EventBus, handlerFrom, Lifecycle } from '@logifex-protocol/core';

const bus = new EventBus();
await bus.start();

bus.subscribe('order.created', handlerFrom((event) => {
  console.log('handling', event.type, event.payload);
}));

await bus.publish(createEvent({ type: 'order.created', payload: { id: 1 } }));
await bus.drain();
```

## Docs

Full repo, architecture docs, and the other packages:
[github.com/logifexglobal/logifex-protocol](https://github.com/logifexglobal/logifex-protocol)

## License

MIT
