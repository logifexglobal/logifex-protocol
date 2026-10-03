# @logifex-protocol/plugin

Logifex Protocol plugin manifest schema, parser, validator, and Core
compatibility check.

> **Pre-stable (`0.x`).** Breaking changes are expected. Not for production yet.

A plugin extends Logifex Protocol through a declared, reviewable
manifest (`plugin.json`) — it never forks or edits Core. `permissions`
and `provides` are declared, not runtime-enforced, in v1. "Plugin
Sandbox" means a structural boundary, not process/VM isolation — no
field here claims a security guarantee that doesn't exist yet.

## Install

```bash
npm install @logifex-protocol/plugin
```

## Usage

```ts
import { parsePluginManifest, checkCoreCompatibility } from '@logifex-protocol/plugin';

const result = parsePluginManifest(rawJson);
if (!result.valid) {
  console.error(result.errors); // every error, not just the first
} else if (!checkCoreCompatibility(result.manifest, actualCoreVersion)) {
  console.error('manifest is well-formed but incompatible with this Core version');
}
```

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

`extensionPoints` is required — an empty array means standalone/general-
purpose; a missing field is an invalid manifest.

## Docs

Full repo and the other packages:
[github.com/logifexglobal/logifex-protocol](https://github.com/logifexglobal/logifex-protocol)

## License

MIT
