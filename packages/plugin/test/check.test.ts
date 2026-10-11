import { afterEach, describe, expect, it } from "vitest";
import { checkPlugin, type PluginReport } from "../src/check.js";
import { cleanup, makePlugin } from "./fixtures.js";

afterEach(cleanup);

function find(report: PluginReport, id: string) {
  const check = report.checks.find((c) => c.id === id);
  if (!check) throw new Error(`no check named ${id}`);
  return check;
}

describe("checkPlugin", () => {
  it("passes a well-formed plugin on every check", () => {
    const report = checkPlugin(makePlugin(), { coreVersion: "0.2.1" });
    expect(report.checks.filter((c) => c.status !== "pass")).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.plugin).toEqual({ name: "telemetry-listener", version: "1.0.0" });
  });

  describe("manifest and package.json", () => {
    it("fails when plugin.json is missing, and skips what depends on it", () => {
      const report = checkPlugin(makePlugin({ manifest: null }), { coreVersion: "0.2.1" });
      expect(find(report, "manifest").status).toBe("fail");
      expect(find(report, "core-compat").status).toBe("skip");
      expect(find(report, "entry-exists").status).toBe("skip");
      expect(report.passed).toBe(false);
    });

    it("fails an invalid manifest and lists the problems", () => {
      const report = checkPlugin(makePlugin({ manifest: { type: "theme" } }), { coreVersion: "0.2.1" });
      const manifest = find(report, "manifest");
      expect(manifest.status).toBe("fail");
      expect(manifest.details?.join(" ")).toContain("type");
      expect(report.passed).toBe(false);
    });

    it("fails when package.json is missing, and skips what depends on it", () => {
      const report = checkPlugin(makePlugin({ pkg: null }), { coreVersion: "0.2.1" });
      expect(find(report, "package-json").status).toBe("fail");
      expect(find(report, "core-peer-dependency").status).toBe("skip");
      expect(find(report, "no-install-scripts").status).toBe("skip");
      expect(report.passed).toBe(false);
    });

    it("fails when the two files disagree on name or version", () => {
      const report = checkPlugin(makePlugin({ pkg: { name: "something-else", version: "2.0.0" } }), { coreVersion: "0.2.1" });
      const identity = find(report, "identity");
      expect(identity.status).toBe("fail");
      expect(identity.details).toHaveLength(2);
    });
  });

  describe("Core compatibility", () => {
    it("fails when the Core version is outside the plugin's range", () => {
      const report = checkPlugin(makePlugin(), { coreVersion: "0.1.0" });
      expect(find(report, "core-compat").status).toBe("fail");
      expect(report.passed).toBe(false);
    });

    it("skips, without failing the plugin, when there is no Core version to check against", () => {
      const report = checkPlugin(makePlugin());
      expect(find(report, "core-compat").status).toBe("skip");
      expect(report.passed).toBe(true);
    });

    it("reads the Core version from the plugin's node_modules when none is given", () => {
      const dir = makePlugin({
        files: { "node_modules/@logifex-protocol/core/package.json": '{"name":"@logifex-protocol/core","version":"0.2.5"}' },
      });
      const report = checkPlugin(dir);
      expect(report.coreVersion).toBe("0.2.5");
      expect(find(report, "core-compat").status).toBe("pass");
    });
  });

  describe("entry file", () => {
    it("fails when the entry has not been built", () => {
      const report = checkPlugin(makePlugin({ files: { "dist/index.js": null } }), { coreVersion: "0.2.1" });
      expect(find(report, "entry-exists").status).toBe("fail");
    });

    it("fails an entry that escapes the plugin directory", () => {
      const report = checkPlugin(makePlugin({ manifest: { entry: "./../outside.js" } }), { coreVersion: "0.2.1" });
      const entry = find(report, "entry-exists");
      expect(entry.status).toBe("fail");
      expect(entry.message).toContain("outside");
    });
  });

  describe("Core as a peer dependency", () => {
    it("fails when Core is in dependencies", () => {
      const report = checkPlugin(makePlugin({ pkg: { dependencies: { "@logifex-protocol/core": "^0.2.0" } } }), { coreVersion: "0.2.1" });
      expect(find(report, "core-peer-dependency").status).toBe("fail");
    });

    it("fails when Core is bundled", () => {
      const report = checkPlugin(makePlugin({ pkg: { bundledDependencies: ["@logifex-protocol/core"] } }), { coreVersion: "0.2.1" });
      expect(find(report, "core-peer-dependency").status).toBe("fail");
    });

    it("fails when the plugin imports Core but does not declare the peer dependency", () => {
      const report = checkPlugin(makePlugin({ pkg: { peerDependencies: undefined } }), { coreVersion: "0.2.1" });
      expect(find(report, "core-peer-dependency").status).toBe("fail");
    });

    it("passes a plugin that never imports Core and declares nothing", () => {
      const quiet = 'export const hello = "world";\n';
      const report = checkPlugin(
        makePlugin({ pkg: { peerDependencies: undefined }, files: { "src/index.ts": quiet, "dist/index.js": quiet } }),
        { coreVersion: "0.2.1" },
      );
      const peer = find(report, "core-peer-dependency");
      expect(peer.status).toBe("pass");
      expect(peer.message).toContain("does not import Core");
    });
  });

  describe("public API only", () => {
    it("fails a deep import into Core", () => {
      const deep = 'import { Lifecycle } from "@logifex-protocol/core/dist/lifecycle.js";\nexport const x = Lifecycle;\n';
      const report = checkPlugin(makePlugin({ files: { "src/deep.ts": deep } }), { coreVersion: "0.2.1" });
      const api = find(report, "public-api-only");
      expect(api.status).toBe("fail");
      expect(api.details?.[0]).toContain("src/deep.ts");
      expect(api.details?.[0]).toContain("@logifex-protocol/core/dist/lifecycle.js");
      expect(report.passed).toBe(false);
    });

    it("catches a deep import when the statement spans several lines", () => {
      const deep = 'import {\n  createEvent,\n  type Event,\n} from "@logifex-protocol/core/dist/event.js";\n';
      const report = checkPlugin(makePlugin({ files: { "src/deep.ts": deep } }), { coreVersion: "0.2.1" });
      expect(find(report, "public-api-only").status).toBe("fail");
    });

    it("catches require() and dynamic import()", () => {
      const deep = 'const a = require("@logifex-protocol/invariant/dist/invariant.js");\nconst b = import("@logifex-protocol/core/src/bus.ts");\n';
      const report = checkPlugin(makePlugin({ files: { "src/deep.js": deep } }), { coreVersion: "0.2.1" });
      expect(find(report, "public-api-only").details).toHaveLength(2);
    });

    it("catches a relative path into node_modules", () => {
      const deep = 'import { EventBus } from "../node_modules/@logifex-protocol/core/dist/bus.js";\n';
      const report = checkPlugin(makePlugin({ files: { "src/deep.ts": deep } }), { coreVersion: "0.2.1" });
      expect(find(report, "public-api-only").status).toBe("fail");
    });

    it("ignores a deep import that only appears in a comment", () => {
      const commented = '// import { Lifecycle } from "@logifex-protocol/core/dist/lifecycle.js";\n/*\n * from "@logifex-protocol/core/dist/bus.js"\n */\nexport const x = 1;\n';
      const report = checkPlugin(makePlugin({ files: { "src/commented.ts": commented } }), { coreVersion: "0.2.1" });
      expect(find(report, "public-api-only").status).toBe("pass");
    });

    it("allows a subpath a protocol package deliberately exports", () => {
      const schema = 'import schema from "@logifex-protocol/plugin/schema";\nexport { schema };\n';
      const report = checkPlugin(makePlugin({ files: { "src/schema.ts": schema } }), { coreVersion: "0.2.1" });
      expect(find(report, "public-api-only").status).toBe("pass");
    });

    it("does not scan test files", () => {
      const deep = 'import { Lifecycle } from "@logifex-protocol/core/dist/lifecycle.js";\n';
      const report = checkPlugin(makePlugin({ files: { "src/index.test.ts": deep } }), { coreVersion: "0.2.1" });
      expect(find(report, "public-api-only").status).toBe("pass");
    });
  });

  describe("install scripts", () => {
    it("fails a postinstall script", () => {
      const report = checkPlugin(makePlugin({ pkg: { scripts: { postinstall: "node setup.js" } } }), { coreVersion: "0.2.1" });
      const scripts = find(report, "no-install-scripts");
      expect(scripts.status).toBe("fail");
      expect(scripts.details).toEqual(["scripts.postinstall"]);
    });

    it("allows scripts that do not run on a consumer's install", () => {
      const report = checkPlugin(makePlugin({ pkg: { scripts: { build: "tsc", prepublishOnly: "npm run build" } } }), { coreVersion: "0.2.1" });
      expect(find(report, "no-install-scripts").status).toBe("pass");
    });
  });

  describe("advisory checks", () => {
    it("warns, without failing the plugin, when the licenses differ", () => {
      const report = checkPlugin(makePlugin({ pkg: { license: "Apache-2.0" } }), { coreVersion: "0.2.1" });
      expect(find(report, "license-consistency").status).toBe("warn");
      expect(report.passed).toBe(true);
    });

    it("warns, without failing the plugin, when a file defines a Core-looking class", () => {
      const copy = "export class EventBus {}\n";
      const report = checkPlugin(makePlugin({ files: { "dist/index.js": copy } }), { coreVersion: "0.2.1" });
      const vendored = find(report, "no-vendored-core");
      expect(vendored.status).toBe("warn");
      expect(vendored.details?.[0]).toContain("dist/index.js");
      expect(report.passed).toBe(true);
    });
  });
});
