# Plugin

A plugin extends Logifex Protocol through a declared, reviewable
manifest — it never forks or edits Core. This is Extension Boundary
made concrete: a plugin imports Core only through its public entry
point, the same rule `ARCH-001` already enforces for internal code in
settle-demo, now applied to third-party code too.

## What v1 actually provides — and what it deliberately does not

| Layer | v1 | Future |
|---|---|---|
| Manifest (`plugin.json`) | ✅ | — |
| Schema validation | ✅ | — |
| Public API boundary | ✅ | — |
| Conformance suite (per-Contract, Adapter-style) | ✅ | — |
| Declared capabilities (`permissions`/`provides`) | ✅ | — |
| Runtime capability enforcement | ❌ | Possible |
| Logical plugin boundary (structural, not security) | ✅ | — |
| Process/VM isolation ("sandbox" as security) | ❌ | Possible |
| Plugin-owned Contracts/Events | Possible | — |
| Global Contract/Event discovery across plugins | Not established | Possible |
| Plugin marketplace/registry | — | Later |

`permissions` and `provides` are **declared, not enforced** in v1 — checked
at review/CI time, not gated by Core at runtime. Nothing in the manifest
implies a security guarantee that doesn't exist yet: there is no
`isolation` field, and "Plugin Sandbox" means a structural boundary,
not a worker/VM/container. Overstating that here would be worse than
not having the field at all.

## `plugin.json`

```json
{
  "name": "telemetry-listener",
  "version": "1.0.0",
  "type": "plugin",
  "description": "Streams Core telemetry events to an external dashboard.",
  "license": "MIT",
  "logifex": { "core": "^0.2.0" },
  "permissions": ["telemetry.read", "auth.events.read"],
  "provides": [],
  "extensionPoints": ["core.telemetry.sink"],
  "entry": "./dist/index.js"
}
```

- `type` is the literal `"plugin"` — a Theme or Template manifest is a
  different shape with its own schema, not a variant of this one.
- `extensionPoints` is **required**, not optional-defaulting-to-general.
  An empty array (`[]`) means standalone/general-purpose; a missing
  field is an invalid manifest. A missing field read as "general
  purpose" would make the one mechanically-verifiable boundary here
  ambiguous.
- `permissions` ("I need X") and `provides` ("I offer Y") are kept
  deliberately separate from **Capability Contract** — `provides`
  today is just an advertised name, not a guarantee. A Capability
  Contract (what a provided capability actually guarantees, requires,
  and is compatible with) is a real future layer, not yet built —
  naming it now would be promising a shape that doesn't exist.

## `@logifex-protocol/plugin`

Unlike Adapter, this has real shared logic worth a package: schema
validation, manifest parsing, and Core-compatibility checking.

```ts
import { parsePluginManifest, checkCoreCompatibility } from '@logifex-protocol/plugin';

const result = parsePluginManifest(rawJson);
if (!result.valid) {
  // result.errors: { field, message }[] — every error, not just the first
}
if (result.valid && !checkCoreCompatibility(result.manifest, actualCoreVersion)) {
  // manifest is well-formed, but declares a Core range this host doesn't satisfy
}
```

Manifest validation (shape, patterns, valid semver *range* syntax) and
Core compatibility (does a specific Core *version* satisfy that range)
are deliberately separate functions — a manifest can be syntactically
valid while still being incompatible with the Core version actually
present.
