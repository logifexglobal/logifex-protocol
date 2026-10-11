import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { cleanup, makePlugin } from "./fixtures.js";

afterEach(cleanup);

function run(...argv: string[]): { code: number; output: string } {
  const lines: string[] = [];
  const code = runCli(argv, (text) => lines.push(text));
  return { code, output: lines.join("\n") };
}

describe("logifex-plugin CLI", () => {
  it("exits 0 and says OK for a good plugin", () => {
    const { code, output } = run("validate", makePlugin(), "--core-version", "0.2.1");
    expect(code).toBe(0);
    expect(output).toContain("OK");
    expect(output).toContain("telemetry-listener@1.0.0");
  });

  it("exits 1 and names the failing check for a bad plugin", () => {
    const dir = makePlugin({ files: { "src/deep.ts": 'import x from "@logifex-protocol/core/dist/bus.js";\n' } });
    const { code, output } = run("validate", dir, "--core-version", "0.2.1");
    expect(code).toBe(1);
    expect(output).toContain("FAIL");
    expect(output).toContain("src/deep.ts");
    expect(output).toContain("FAILED");
  });

  it("prints machine-readable JSON with --json", () => {
    const { code, output } = run("validate", makePlugin(), "--core-version", "0.2.1", "--json");
    const report = JSON.parse(output) as { passed: boolean; checks: { id: string }[] };
    expect(code).toBe(0);
    expect(report.passed).toBe(true);
    expect(report.checks.map((c) => c.id)).toContain("public-api-only");
  });

  it("reports a warning without failing", () => {
    const { code, output } = run("validate", makePlugin({ pkg: { license: "Apache-2.0" } }), "--core-version", "0.2.1");
    expect(code).toBe(0);
    expect(output).toContain("WARN");
    expect(output).toContain("1 warning(s)");
  });

  it("exits 2 with usage for a missing or unknown command", () => {
    expect(run().code).toBe(2);
    expect(run("deploy").code).toBe(2);
    expect(run("deploy").output).toContain("Usage");
  });

  it("exits 0 for --help", () => {
    const { code, output } = run("--help");
    expect(code).toBe(0);
    expect(output).toContain("Usage");
  });

  it("exits 2 on a bad option", () => {
    expect(run("validate", "--bogus").code).toBe(2);
    expect(run("validate", "--core-version").code).toBe(2);
    expect(run("validate", "--core-version", "--json").code).toBe(2);
    expect(run("validate", "a", "b").code).toBe(2);
  });
});
