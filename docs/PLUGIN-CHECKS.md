# Plugin checks

`logifex-plugin validate` checks a plugin directory against the Logifex Protocol plugin rules.
The same checks are available in code as `checkPlugin()` from `@logifex-protocol/plugin`, which
returns a structured report. A marketplace score is built from that report, so every check is
reported separately instead of being folded into one pass/fail.

```bash
npx logifex-plugin validate [dir] [--core-version 0.2.1] [--json]
```

Without `--core-version`, the Core installed in the plugin's `node_modules` is used. Exit codes:
`0` no blocking check failed, `1` a blocking check failed, `2` usage error.

## The checks

A failing **blocking** check keeps a plugin from being listed. An **advisory** check only warns.
A skipped check (its inputs were missing) never fails a plugin.

| id | blocking | what it checks |
|---|---|---|
| `manifest` | yes | `plugin.json` exists and passes the manifest schema |
| `package-json` | yes | `package.json` exists and is valid JSON |
| `identity` | yes | `plugin.json` and `package.json` agree on `name` and `version` |
| `core-compat` | yes | the plugin's `logifex.core` range accepts the Core version being checked |
| `entry-exists` | yes | the entry file exists, and sits inside the plugin directory |
| `core-peer-dependency` | yes | Core is a `peerDependency`, not a `dependency` and not bundled |
| `public-api-only` | yes | no import reaches into a protocol package's internals (`@logifex-protocol/core/dist/...`) |
| `no-install-scripts` | yes | no `preinstall`, `install` or `postinstall` script |
| `license-consistency` | no | `package.json` and `plugin.json` declare the same license |
| `no-vendored-core` | no | no file defines a class named like a Core primitive |

## What a passing report does not tell you

A passing report means the plugin follows the rules. It does **not** mean the plugin is safe.

- Import checks are a regex scan, not a parser. A dynamic specifier (`require(name)`) or a minified
  bundle that inlined Core is not caught. `no-vendored-core` is a heuristic for that reason, and
  is advisory.
- `permissions` in `plugin.json` are declared, not enforced. Nothing stops a plugin from doing what
  it did not declare.
- The checks run on the files in the directory. They do not verify that the Core a plugin later
  runs against is the official build. That belongs to the loader, which does not exist yet.
- When a protocol package starts exporting a new public subpath, add it to `PUBLIC_SUBPATHS` in
  `check.ts`, or `public-api-only` will reject imports of it.
