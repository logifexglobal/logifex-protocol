import { describe, it, expect } from "vitest";
import { validatePluginManifest, parsePluginManifest } from "../src/manifest.js";

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    name: "telemetry-listener",
    version: "1.0.0",
    type: "plugin",
    category: "telemetry",
    description: "Streams Core telemetry events to an external dashboard.",
    author: "Aliasger Baroor",
    license: "MIT",
    repository: "https://github.com/yourname/telemetry-listener",
    logifex: { core: "^0.2.0" },
    permissions: ["telemetry.read", "auth.events.read"],
    provides: [],
    extensionPoints: ["core.telemetry.sink"],
    usesAI: false,
    entry: "./dist/index.js",
    ...overrides,
  };
}

function fieldErrors(result: ReturnType<typeof validatePluginManifest>): string[] {
  return result.valid ? [] : result.errors.map((e) => e.field);
}

describe("validatePluginManifest", () => {
  it("accepts a valid manifest (telemetry-listener)", () => {
    const result = validatePluginManifest(validManifest());
    expect(result.valid).toBe(true);
  });

  it("accepts a valid manifest with empty permissions/provides/extensionPoints", () => {
    const result = validatePluginManifest(
      validManifest({ permissions: [], provides: [], extensionPoints: [] })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a manifest missing a required field (entry)", () => {
    const { entry, ...rest } = validManifest();
    const result = validatePluginManifest(rest);
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("entry");
  });

  it("rejects every required field missing at once, reporting all of them", () => {
    const result = validatePluginManifest({});
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toEqual(
      expect.arrayContaining([
        "name", "version", "type", "description", "license",
        "logifex", "permissions", "provides", "extensionPoints", "entry",
      ])
    );
  });

  it("rejects an invalid semver range for logifex.core", () => {
    const result = validatePluginManifest(validManifest({ logifex: { core: "not-a-range" } }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("logifex.core");
  });

  it("rejects a malformed permission string", () => {
    const result = validatePluginManifest(validManifest({ permissions: ["TelemetryRead", "read"] }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("permissions");
  });

  it("rejects a malformed provides string", () => {
    const result = validatePluginManifest(validManifest({ provides: ["Payments"] }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("provides");
  });

  it("rejects a malformed extensionPoints string", () => {
    const result = validatePluginManifest(validManifest({ extensionPoints: ["core telemetry sink"] }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("extensionPoints");
  });

  it('rejects "type": "theme" — type must be the literal "plugin"', () => {
    const result = validatePluginManifest(validManifest({ type: "theme" }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("type");
  });

  it("rejects an invalid plugin name", () => {
    const result = validatePluginManifest(validManifest({ name: "Not A Valid Name!" }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("name");
  });

  it("accepts a scoped plugin name", () => {
    const result = validatePluginManifest(validManifest({ name: "@logifexglobal/telemetry-listener" }));
    expect(result.valid).toBe(true);
  });

  it("rejects an invalid version", () => {
    const result = validatePluginManifest(validManifest({ version: "v1.0" }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("version");
  });

  it("rejects an invalid entry path", () => {
    const result = validatePluginManifest(validManifest({ entry: "/dist/index.php" }));
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("entry");
  });

  it("parsePluginManifest rejects malformed JSON before field validation runs", () => {
    const result = parsePluginManifest("{ not valid json");
    expect(result.valid).toBe(false);
    expect(fieldErrors(result)).toContain("(root)");
  });

  it("parsePluginManifest accepts a valid manifest from raw JSON text", () => {
    const result = parsePluginManifest(JSON.stringify(validManifest()));
    expect(result.valid).toBe(true);
  });
});
