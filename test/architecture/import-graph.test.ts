import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { collectImports } from "./import-graph.ts";

const root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-import-graph-")).split(path.sep).join("/");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("collectImports", () => {
  test("records every import form that can pull in a module", () => {
    writeFileSync(
      path.join(root, "probe.ts"),
      [
        'import { a } from "./static.ts";',
        'export { b } from "./reexport.ts";',
        'import type { C } from "./type-only.ts";',
        'type D = typeof import("./import-type.ts");',
        'const e = await import("./dynamic.ts");',
        "const f = await import(`./template.ts`);",
        'const g = require("./require.ts");',
        'import h = require("./import-equals.ts");',
      ].join("\n"),
    );

    const resolved = collectImports(root).map((edge) => edge.resolved?.slice(root.length + 1));

    expect(resolved.sort()).toEqual(
      [
        "dynamic.ts",
        "import-equals.ts",
        "import-type.ts",
        "reexport.ts",
        "require.ts",
        "static.ts",
        "template.ts",
        "type-only.ts",
      ].sort(),
    );
  });
});
