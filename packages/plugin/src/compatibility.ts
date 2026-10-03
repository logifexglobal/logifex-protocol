/**
 * Core compatibility check.
 *
 * Separate from manifest validation on purpose: validatePluginManifest()
 * checks that logifex.core is a syntactically valid semver RANGE — it
 * has no opinion on any particular Core version. checkCoreCompatibility()
 * is the semantic check, run against the Core version actually present
 * (e.g. in CI, or at install time by a future plugin loader).
 */

import { satisfies } from "semver";
import type { PluginManifest } from "./types.js";

export function checkCoreCompatibility(manifest: PluginManifest, coreVersion: string): boolean {
  return satisfies(coreVersion, manifest.logifex.core);
}
