/**
 * Plugin directory checks.
 *
 * checkPlugin() looks at a plugin's directory and reports, check by check, whether it follows the
 * Logifex Protocol plugin rules. It is the raw material for a marketplace score: every check is
 * individually reported, so a score can weight them without re-deriving anything.
 *
 * A passing report means the plugin follows the rules. It does NOT mean the plugin is safe. These
 * are static checks: a regex scan of import statements can be fooled by a dynamic specifier or a
 * minified bundle, and `permissions` in plugin.json are declared, not enforced, in v1. Verifying
 * that the Core a plugin runs against is the official build is the loader's job, not this one's.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { checkCoreCompatibility } from "./compatibility.js";
import { parsePluginManifest } from "./manifest.js";
import type { PluginManifest } from "./types.js";

const CORE = "@logifex-protocol/core";
const SCOPE = "@logifex-protocol/";

/** Subpaths a protocol package deliberately exposes through its package.json "exports". */
const PUBLIC_SUBPATHS: ReadonlySet<string> = new Set(["@logifex-protocol/plugin/schema"]);

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\./;
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"] as const;

/** Heuristic only: class names a plugin has no reason to define unless it carries a copy of Core. */
const VENDORED_CORE = /\bclass\s+(EventBus|Lifecycle|LifecycleTransitionError|InvariantRegistry|InvariantViolation)\b/;

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  readonly id: string;
  readonly title: string;
  /** A failing blocking check keeps a plugin from being listed. An advisory one only warns. */
  readonly blocking: boolean;
  readonly status: CheckStatus;
  readonly message: string;
  readonly details?: readonly string[];
}

export interface PluginReport {
  readonly dir: string;
  readonly plugin: { readonly name?: string; readonly version?: string };
  readonly coreVersion?: string;
  readonly checks: readonly CheckResult[];
  /** True when no blocking check failed. Skipped and advisory checks never fail a plugin. */
  readonly passed: boolean;
}

export interface CheckOptions {
  /** The Core version to check compatibility against. Defaults to the Core installed in the plugin's node_modules. */
  readonly coreVersion?: string;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): Json | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function recordField(obj: Json | undefined, key: string): Json {
  const value = obj?.[key];
  return isRecord(value) ? value : {};
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function outcome(
  id: string,
  title: string,
  blocking: boolean,
  status: CheckStatus,
  message: string,
  details?: readonly string[],
): CheckResult {
  return details && details.length > 0
    ? { id, title, blocking, status, message, details }
    : { id, title, blocking, status, message };
}

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function collectFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) out.push(full);
  }
}

/** The plugin's source (src/) and its built output (the directory holding the entry), tests excluded. */
function sourceFiles(root: string, manifest: PluginManifest | undefined): SourceFile[] {
  const paths = new Set<string>();
  const list: string[] = [];

  const src = join(root, "src");
  if (existsSync(src)) collectFiles(src, list);

  if (manifest) {
    const entry = resolve(root, manifest.entry);
    if (isInside(root, entry)) {
      const entryDir = dirname(entry);
      if (entryDir === root) {
        if (existsSync(entry)) list.push(entry);
      } else if (existsSync(entryDir)) {
        collectFiles(entryDir, list);
      }
    }
  }

  for (const path of list) paths.add(path);
  return [...paths].map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

interface ImportRef {
  readonly file: string;
  readonly specifier: string;
}

function importsIn(file: SourceFile, root: string): ImportRef[] {
  const refs: ImportRef[] = [];
  for (const line of file.text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier !== undefined) refs.push({ file: relative(root, file.path), specifier });
      }
    }
  }
  return refs;
}

function isDeepProtocolImport(specifier: string): boolean {
  if (/node_modules[\\/]@logifex-protocol[\\/]/.test(specifier)) return true;
  if (!specifier.startsWith(SCOPE)) return false;
  return specifier.split("/").length > 2 && !PUBLIC_SUBPATHS.has(specifier);
}

function importsCore(specifier: string): boolean {
  return specifier === CORE || specifier.startsWith(`${CORE}/`);
}

function resolveCoreVersion(root: string, explicit: string | undefined): string | undefined {
  if (explicit !== undefined) return explicit;
  const installed = readJson(join(root, "node_modules", "@logifex-protocol", "core", "package.json"));
  return typeof installed?.version === "string" ? installed.version : undefined;
}

export function checkPlugin(dir: string, options: CheckOptions = {}): PluginReport {
  const root = resolve(dir);
  const checks: CheckResult[] = [];

  // plugin.json
  let manifest: PluginManifest | undefined;
  const manifestPath = join(root, "plugin.json");
  const manifestTitle = "plugin.json is a valid manifest";
  if (!existsSync(manifestPath)) {
    checks.push(outcome("manifest", manifestTitle, true, "fail", "plugin.json not found"));
  } else {
    const parsed = parsePluginManifest(readFileSync(manifestPath, "utf8"));
    if (parsed.valid) {
      manifest = parsed.manifest;
      checks.push(outcome("manifest", manifestTitle, true, "pass", "plugin.json is valid"));
    } else {
      checks.push(
        outcome("manifest", manifestTitle, true, "fail", `plugin.json has ${parsed.errors.length} error(s)`,
          parsed.errors.map((e) => `${e.field}: ${e.message}`)),
      );
    }
  }

  // package.json
  const pkg = readJson(join(root, "package.json"));
  checks.push(
    pkg
      ? outcome("package-json", "package.json is readable", true, "pass", "package.json is readable")
      : outcome("package-json", "package.json is readable", true, "fail", "package.json is missing or is not valid JSON"),
  );

  // identity
  const identityTitle = "plugin.json and package.json agree on name and version";
  if (!manifest || !pkg) {
    checks.push(outcome("identity", identityTitle, true, "skip", "needs a valid plugin.json and package.json"));
  } else {
    const problems: string[] = [];
    if (pkg.name !== manifest.name) {
      problems.push(`name: plugin.json has "${manifest.name}", package.json has ${JSON.stringify(pkg.name)}`);
    }
    if (pkg.version !== manifest.version) {
      problems.push(`version: plugin.json has "${manifest.version}", package.json has ${JSON.stringify(pkg.version)}`);
    }
    checks.push(
      problems.length === 0
        ? outcome("identity", identityTitle, true, "pass", "name and version match")
        : outcome("identity", identityTitle, true, "fail", "plugin.json and package.json disagree", problems),
    );
  }

  // Core compatibility
  const coreVersion = resolveCoreVersion(root, options.coreVersion);
  const compatTitle = "the plugin's Core range accepts the Core version being checked";
  if (!manifest) {
    checks.push(outcome("core-compat", compatTitle, true, "skip", "needs a valid plugin.json"));
  } else if (coreVersion === undefined) {
    checks.push(
      outcome("core-compat", compatTitle, true, "skip",
        "no Core version to check against (install @logifex-protocol/core, or pass --core-version)"),
    );
  } else if (checkCoreCompatibility(manifest, coreVersion)) {
    checks.push(outcome("core-compat", compatTitle, true, "pass", `Core ${coreVersion} satisfies ${manifest.logifex.core}`));
  } else {
    checks.push(outcome("core-compat", compatTitle, true, "fail", `Core ${coreVersion} does not satisfy ${manifest.logifex.core}`));
  }

  // entry file
  const entryTitle = "the entry file exists inside the plugin";
  if (!manifest) {
    checks.push(outcome("entry-exists", entryTitle, true, "skip", "needs a valid plugin.json"));
  } else {
    const entryPath = resolve(root, manifest.entry);
    if (!isInside(root, entryPath)) {
      checks.push(outcome("entry-exists", entryTitle, true, "fail", `entry "${manifest.entry}" points outside the plugin directory`));
    } else if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
      checks.push(outcome("entry-exists", entryTitle, true, "fail", `entry "${manifest.entry}" does not exist (has the plugin been built?)`));
    } else {
      checks.push(outcome("entry-exists", entryTitle, true, "pass", `entry "${manifest.entry}" exists`));
    }
  }

  const files = sourceFiles(root, manifest);
  const refs = files.flatMap((file) => importsIn(file, root));

  // Core is a peer dependency
  const peerTitle = "Core is a peer dependency, never bundled";
  if (!pkg) {
    checks.push(outcome("core-peer-dependency", peerTitle, true, "skip", "needs a readable package.json"));
  } else {
    const dependencies = recordField(pkg, "dependencies");
    const peers = recordField(pkg, "peerDependencies");
    const bundled = pkg.bundledDependencies ?? pkg.bundleDependencies;
    const usesCore = refs.some((ref) => importsCore(ref.specifier));
    const problems: string[] = [];
    if (CORE in dependencies) {
      problems.push(`${CORE} is in "dependencies": declare it in "peerDependencies" so the host app's single copy is used`);
    }
    if (Array.isArray(bundled) && bundled.includes(CORE)) {
      problems.push(`${CORE} is in bundledDependencies: a plugin must not ship its own copy of Core`);
    }
    if (usesCore && !(CORE in peers)) {
      problems.push(`the plugin imports ${CORE} but does not declare it in "peerDependencies"`);
    }
    checks.push(
      problems.length > 0
        ? outcome("core-peer-dependency", peerTitle, true, "fail", "Core is not declared as a peer dependency", problems)
        : outcome("core-peer-dependency", peerTitle, true, "pass", usesCore ? "Core is a peer dependency" : "the plugin does not import Core"),
    );
  }

  // public API only
  const apiTitle = "Core is used through its public API only";
  if (files.length === 0) {
    checks.push(outcome("public-api-only", apiTitle, true, "skip", "no source files found (looked in src/ and the entry's directory)"));
  } else {
    const violations = refs
      .filter((ref) => isDeepProtocolImport(ref.specifier))
      .map((ref) => `${ref.file}: imports "${ref.specifier}"`);
    checks.push(
      violations.length > 0
        ? outcome("public-api-only", apiTitle, true, "fail", `${violations.length} import(s) reach into protocol internals`, violations)
        : outcome("public-api-only", apiTitle, true, "pass", `${files.length} file(s) scanned, no deep imports`),
    );
  }

  // install scripts
  const scriptsTitle = "no install scripts";
  if (!pkg) {
    checks.push(outcome("no-install-scripts", scriptsTitle, true, "skip", "needs a readable package.json"));
  } else {
    const scripts = recordField(pkg, "scripts");
    const found = INSTALL_SCRIPTS.filter((name) => name in scripts);
    checks.push(
      found.length > 0
        ? outcome("no-install-scripts", scriptsTitle, true, "fail", "install scripts run on every consumer's machine", found.map((name) => `scripts.${name}`))
        : outcome("no-install-scripts", scriptsTitle, true, "pass", "no preinstall, install or postinstall script"),
    );
  }

  // license consistency (advisory)
  const licenseTitle = "package.json and plugin.json declare the same license";
  if (!manifest || !pkg) {
    checks.push(outcome("license-consistency", licenseTitle, false, "skip", "needs a valid plugin.json and package.json"));
  } else if (typeof pkg.license !== "string") {
    checks.push(outcome("license-consistency", licenseTitle, false, "warn", "package.json has no license field"));
  } else if (pkg.license !== manifest.license) {
    checks.push(outcome("license-consistency", licenseTitle, false, "warn", `plugin.json says "${manifest.license}", package.json says "${pkg.license}"`));
  } else {
    checks.push(outcome("license-consistency", licenseTitle, false, "pass", `both say "${manifest.license}"`));
  }

  // possibly bundled copy of Core (advisory, heuristic)
  const vendoredTitle = "no copy of Core appears to be bundled";
  if (files.length === 0) {
    checks.push(outcome("no-vendored-core", vendoredTitle, false, "skip", "no source files found"));
  } else {
    const suspects = files
      .filter((file) => VENDORED_CORE.test(file.text))
      .map((file) => `${relative(root, file.path)}: defines a class named like a Core primitive`);
    checks.push(
      suspects.length > 0
        ? outcome("no-vendored-core", vendoredTitle, false, "warn", "this looks like it may carry a copy of Core (heuristic, a minified bundle would not be caught)", suspects)
        : outcome("no-vendored-core", vendoredTitle, false, "pass", "no Core primitive is defined in the plugin's files"),
    );
  }

  const passed = !checks.some((check) => check.blocking && check.status === "fail");
  return { dir: root, plugin: { name: manifest?.name, version: manifest?.version }, coreVersion, checks, passed };
}
