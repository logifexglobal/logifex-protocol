import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const created: string[] = [];

export function cleanup(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}

function write(root: string, path: string, text: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

export interface PluginFixture {
  /** Merged over a valid manifest. `null` leaves plugin.json out entirely. */
  manifest?: Record<string, unknown> | null;
  /** Merged over a valid package.json. `null` leaves package.json out entirely. */
  pkg?: Record<string, unknown> | null;
  /** Files relative to the plugin directory. A `null` value removes a default file. */
  files?: Record<string, string | null>;
}

const SOURCE = 'import { createEvent } from "@logifex-protocol/core";\nexport const make = createEvent;\n';

/** Builds a valid plugin in a temp directory, with whatever the test wants broken. */
export function makePlugin(fixture: PluginFixture = {}): string {
  const root = mkdtempSync(join(tmpdir(), "lfx-plugin-"));
  created.push(root);

  const manifest = {
    name: "telemetry-listener",
    version: "1.0.0",
    type: "plugin",
    description: "Streams Core telemetry events to a dashboard.",
    license: "MIT",
    logifex: { core: "^0.2.0" },
    permissions: ["telemetry.read"],
    provides: [],
    extensionPoints: ["core.telemetry.sink"],
    entry: "./dist/index.js",
    ...(fixture.manifest ?? {}),
  };
  const pkg = {
    name: "telemetry-listener",
    version: "1.0.0",
    license: "MIT",
    peerDependencies: { "@logifex-protocol/core": "^0.2.0" },
    ...(fixture.pkg ?? {}),
  };
  const files: Record<string, string | null> = {
    "src/index.ts": SOURCE,
    "dist/index.js": SOURCE,
    ...(fixture.files ?? {}),
  };

  if (fixture.manifest !== null) write(root, "plugin.json", JSON.stringify(manifest));
  if (fixture.pkg !== null) write(root, "package.json", JSON.stringify(pkg));
  for (const [path, text] of Object.entries(files)) {
    if (text !== null) write(root, path, text);
  }
  return root;
}
