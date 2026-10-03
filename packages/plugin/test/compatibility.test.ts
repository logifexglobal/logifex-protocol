import { describe, it, expect } from "vitest";
import { checkCoreCompatibility } from "../src/compatibility.js";
import { validatePluginManifest } from "../src/manifest.js";
import type { PluginManifest } from "../src/types.js";

function manifestWith(core: string): PluginManifest {
  const result = validatePluginManifest({
    name: "telemetry-listener",
    version: "1.0.0",
    type: "plugin",
    description: "x",
    license: "MIT",
    logifex: { core },
    permissions: [],
    provides: [],
    extensionPoints: [],
    entry: "./dist/index.js",
  });
  if (!result.valid) throw new Error("test fixture manifest should be valid");
  return result.manifest;
}

describe("checkCoreCompatibility", () => {
  it("accepts a Core version within the declared range", () => {
    expect(checkCoreCompatibility(manifestWith("^0.2.0"), "0.2.0")).toBe(true);
    expect(checkCoreCompatibility(manifestWith("^0.2.0"), "0.2.5")).toBe(true);
  });

  it("rejects an incompatible Core range", () => {
    expect(checkCoreCompatibility(manifestWith("^0.2.0"), "0.1.0")).toBe(false);
    expect(checkCoreCompatibility(manifestWith("^1.0.0"), "0.2.0")).toBe(false);
  });
});
