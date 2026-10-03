# Adapter

A boundary component that translates between a Logifex Contract and an
external system's own interface or protocol.

**Depends on:** [Contract](../README.md#core-primitives-logifex-protocolcore)

Adapter is not one of the five Core primitives, and it is not a
runtime package. It's a documented pattern — a set of guarantees any
implementation must satisfy, with no forced abstraction imposed on top
of it. The pattern was not designed ahead of need: it was formalized
directly from a real implementation, `RazorpayXPayouts` satisfying a
`PayoutProvider` Contract, in the settle-demo application.

## Why a pattern, not a package

There's no shared runtime code to abstract yet — every Adapter is just
a class or object satisfying a Contract interface. Adding a marker
type or a `defineAdapter()` helper now, with only one real Adapter in
existence, would mean designing tooling for a generalization that
hasn't been proven yet. That's revisited only once a second real
Adapter (a different payment provider, a sandbox implementation)
exists and something concrete is actually worth sharing between them.

## Guarantees

### Lifecycle — optional, not required

Unlike Handler, an Adapter is allowed to own external resources or
provider-specific state, so Lifecycle is a capability an Adapter
implementation may compose when setup/teardown is meaningful — a
connection pool, a persistent socket. It is not a requirement imposed
on every Adapter. The reference implementation (`RazorpayXPayouts`,
backed by a plain fetch-based HTTP client) needs no lifecycle at all,
and forcing one on it would mean modeling setup/teardown that doesn't
exist.

### Faithfulness — Contract-level substitutability

An Adapter must satisfy the guarantees the Contract promises. It does
not need to behave identically to every other Adapter satisfying the
same Contract in every provider-specific observable detail.

Evidence: `mapPayoutStatus()` translates Razorpay's own status
vocabulary (`processed`, `failed`, `rejected`, `cancelled`,
`reversed`) into `PayoutProvider`'s four canonical result states
(`confirmed` / `pending` / `failed` / `unknown`). A future Stripe
Adapter maps an entirely different vocabulary into the same four
states. Domain code only ever sees the Contract's vocabulary, never a
provider's.

### Error translation — resolve, don't throw

When a Contract's result type already models failure and ambiguity as
part of its shape, provider-specific errors must not cross the
Contract-facing boundary as thrown exceptions — they resolve into the
Contract's own result vocabulary instead, translated or not. This is
stronger than "wrap the error in a Logifex-defined error class": if
the result type can already express "definitely failed" and "we don't
know," throwing anything defeats the point of having designed that
result type, since every caller would need two separate error-handling
paths (try/catch and a status check) instead of one.

Evidence: `RazorpayXPayouts.send()` and `.check()` never throw.
`RazorpayApiError` is caught internally; a definite provider rejection
becomes `{status: 'failed', reason}`, and genuine ambiguity (timeout,
5xx, 429, an outage page) becomes `{status: 'unknown', reason}` —
letting the caller safely retry with the same idempotency key instead
of guessing. Provider diagnostics are retained as `reason`, not lost —
just carried as data instead of as a thrown error's message.

This guarantee applies specifically to the Contract-facing method.
Internal Adapter machinery (the HTTP client underneath it, for
example) may throw freely — that's an implementation detail, not the
Contract-facing surface.

## The relationship

```
                 Logifex Contract
                       ▲
                       │ satisfies
                       │
                    Adapter
                       │
             translates / isolates
                       │
                       ▼
              External Provider
```

Contract defines what the application can rely on. Adapter defines how
an external system is made to satisfy that Contract.

## Status

Backed by **two** real implementations of the same `PayoutProvider`
Contract in settle-demo, deliberately different in shape:

- `RazorpayXPayouts` — HTTP-backed. Translates a real provider's status
  vocabulary and errors into the Contract's result vocabulary.
- `SandboxPayoutProvider` — fully simulated, no network. Resolves
  straight into the same vocabulary, supports synchronous and
  asynchronous modes, and injects failures for tests.

Both hold all three guarantees: neither needs a Lifecycle, both return
the same `PayoutResult` states (Contract-level substitutability), and
neither lets an implementation error escape the Contract-facing methods
as an exception. Note the Sandbox never produces `unknown` — it has no
real network to be ambiguous about — which is fine: an implementation
is not required to exercise every state the Contract allows.

## Verification

The guarantees are checked by a shared conformance suite that lives with
the Contract (`runPayoutProviderContract` in settle-demo) and is run
against every `PayoutProvider` implementation. For each Adapter it checks
that:

- results use only the Contract's vocabulary and shape,
- a provider failure resolves as `failed` (and an ambiguous one as
  `unknown`) instead of throwing,
- a failed payout can be retried as a new payout,
- a repeated idempotency key is the same payout, and `check()` resolves
  even for a payout the provider has never heard of.

The suite itself is tested: it is run against three deliberately broken
adapters (one that throws, one that leaks a provider's status names, one
that ignores the idempotency key) and must reject each.

In Invariant terms, "Contract-facing Adapter methods must not throw" is
`validated` for `PayoutProvider` — verified by tests, but not blocked at
build time and not guarded at runtime. Promoting it to `enforced` means
running the suite in CI for every provider package. The suite belongs
with each Contract, not in Logifex Protocol, because the Protocol
defines no Contracts of its own. A reusable harness is worth extracting
only when a second Contract with several Adapters needs one.
