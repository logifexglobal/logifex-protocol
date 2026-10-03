/**
 * Manifest validation for Logifex Protocol plugins.
 *
 * This enforces the same rules as schema/plugin.schema.json, in plain
 * TypeScript rather than through a JSON-Schema engine (e.g. ajv) — one
 * real dependency (semver, for Core compatibility ranges) is enough
 * for a tooling package; the schema file is shipped separately for
 * editor/IDE validation, not executed here.
 *
 * Deliberately NOT part of this manifest: anything implying a sandbox
 * type, trust level, or security tier. Adding a field like
 * `"isolation": "none"` would assert a security property that does
 * not exist yet. permissions/provides here are declared and checked
 * at review/CI time, never enforced by Core at runtime in v1.
 */

import { validRange } from "semver";
import type { PluginManifest, ValidationError, ValidationResult } from "./types.js";

const NAME_PATTERN = /^(@[a-z0-9-]+\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const NAMESPACE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
const ENTRY_PATTERN = /^\.\/.+\.(js|mjs|cjs)$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?(\+[0-9A-Za-z-.]+)?$/;

const REQUIRED_FIELDS = [
  "name", "version", "type", "description", "license",
  "logifex", "permissions", "provides", "extensionPoints", "entry",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function namespaceErrors(field: string, value: unknown): ValidationError[] {
  if (!isStringArray(value)) {
    return [{ field, message: `${field} must be an array of strings` }];
  }
  return value
    .filter((item) => !NAMESPACE_PATTERN.test(item))
    .map((item) => ({
      field,
      message: `${field} entry "${item}" must match the namespace pattern (e.g. "telemetry.read")`,
    }));
}

/**
 * Validates an already-parsed manifest object. Returns every error
 * found, not just the first — a plugin author fixing a manifest
 * benefits from seeing the whole list in one pass.
 */
export function validatePluginManifest(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return { valid: false, errors: [{ field: "(root)", message: "manifest must be a JSON object" }] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in input)) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (typeof input.name === "string" && !NAME_PATTERN.test(input.name)) {
    errors.push({ field: "name", message: `"${input.name}" is not a valid plugin name` });
  }

  if (typeof input.version === "string" && !SEMVER_PATTERN.test(input.version)) {
    errors.push({ field: "version", message: `"${input.version}" is not a valid semver version` });
  }

  if ("type" in input && input.type !== "plugin") {
    errors.push({ field: "type", message: `type must be the literal "plugin", got ${JSON.stringify(input.type)}` });
  }

  if ("description" in input && (typeof input.description !== "string" || input.description.length === 0)) {
    errors.push({ field: "description", message: "description must be a non-empty string" });
  }

  if ("license" in input && (typeof input.license !== "string" || input.license.length === 0)) {
    errors.push({ field: "license", message: "license must be a non-empty string" });
  }

  if ("logifex" in input) {
    if (!isRecord(input.logifex) || typeof input.logifex.core !== "string") {
      errors.push({ field: "logifex.core", message: "logifex.core is required and must be a string" });
    } else if (validRange(input.logifex.core) === null) {
      errors.push({ field: "logifex.core", message: `"${input.logifex.core}" is not a valid semver range` });
    }
  }

  if ("permissions" in input) errors.push(...namespaceErrors("permissions", input.permissions));
  if ("provides" in input) errors.push(...namespaceErrors("provides", input.provides));
  if ("extensionPoints" in input) errors.push(...namespaceErrors("extensionPoints", input.extensionPoints));

  if ("entry" in input && (typeof input.entry !== "string" || !ENTRY_PATTERN.test(input.entry))) {
    errors.push({ field: "entry", message: `entry must be a relative path ending in .js/.mjs/.cjs (e.g. "./dist/index.js")` });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, manifest: input as unknown as PluginManifest };
}

/** Parses a plugin.json file's raw text, then validates it. */
export function parsePluginManifest(json: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      valid: false,
      errors: [{ field: "(root)", message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }
  return validatePluginManifest(parsed);
}
