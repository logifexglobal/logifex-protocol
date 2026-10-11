import { checkPlugin, type CheckStatus, type PluginReport } from "./check.js";

const USAGE = `Usage: logifex-plugin validate [dir] [--core-version <version>] [--json]

Checks a plugin directory against the Logifex Protocol plugin rules.
dir defaults to the current directory. Without --core-version, the Core installed
in the plugin's node_modules is used.

Exit codes: 0 no blocking check failed, 1 a blocking check failed, 2 usage error.`;

const TAG: Record<CheckStatus, string> = { pass: "PASS", fail: "FAIL", warn: "WARN", skip: "SKIP" };

export function formatReport(report: PluginReport): string {
  const lines: string[] = [];
  const { name, version } = report.plugin;
  const who = name ? (version ? `${name}@${version}` : name) : report.dir;
  lines.push(`logifex-plugin validate: ${who}`);
  if (report.coreVersion) lines.push(`checked against Core ${report.coreVersion}`);
  lines.push("");
  for (const check of report.checks) {
    lines.push(`  ${TAG[check.status]}  ${check.title}${check.status === "pass" ? "" : `: ${check.message}`}`);
    for (const detail of check.details ?? []) lines.push(`          ${detail}`);
  }
  const blocking = report.checks.filter((c) => c.blocking && c.status === "fail").length;
  const warnings = report.checks.filter((c) => c.status === "warn").length;
  lines.push("");
  lines.push(
    report.passed
      ? `OK: no blocking problems${warnings > 0 ? `, ${warnings} warning(s)` : ""}.`
      : `FAILED: ${blocking} blocking problem(s).`,
  );
  return lines.join("\n");
}

/** Runs the CLI. Returns the exit code instead of exiting, so it can be tested. */
export function runCli(argv: readonly string[], write: (text: string) => void): number {
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h") {
    write(USAGE);
    return 0;
  }
  if (command === undefined) {
    write(USAGE);
    return 2;
  }
  if (command !== "validate") {
    write(`Unknown command "${command}"\n\n${USAGE}`);
    return 2;
  }

  let dir = ".";
  let sawDir = false;
  let coreVersion: string | undefined;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--json") {
      json = true;
    } else if (arg === "--core-version") {
      const value = rest[++i];
      if (value === undefined || value.startsWith("--")) {
        write("--core-version needs a value, for example --core-version 0.2.1");
        return 2;
      }
      coreVersion = value;
    } else if (arg.startsWith("--")) {
      write(`Unknown option "${arg}"\n\n${USAGE}`);
      return 2;
    } else if (!sawDir) {
      dir = arg;
      sawDir = true;
    } else {
      write(`Unexpected argument "${arg}"\n\n${USAGE}`);
      return 2;
    }
  }

  const report = checkPlugin(dir, { coreVersion });
  write(json ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.passed ? 0 : 1;
}
