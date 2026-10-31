import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { collectImports, type ImportEdge, listSourceFiles } from "./import-graph.ts";

const DOMAIN = "src/core/domain/";
const PORTS = "src/core/ports/";
const APPLICATION = "src/core/application/";
const INFRASTRUCTURE = "src/infrastructure/";
const ADAPTERS = "src/adapters/";
const CORE_ENTRY = "src/core/index.ts";
const BOOTSTRAP = "src/bootstrap.ts";
const MAIN = "src/main.ts";

// Empty since phase 1b; keep the rules for future legacy code.
const LEGACY: readonly string[] = [];

const PROCESS_IO =
  /process\.(stdout|stderr|exit|exitCode|argv)\b|console\.|Bun\.(stdout|stderr)\b|\{[^}]*\b(stdout|stderr|exit|exitCode|argv)\b[^}]*\}\s*=\s*process\b/;
const PROCESS_MODULES = new Set(["node:process", "process"]);
// Guards against a broken collector making every edge rule pass vacuously.
const MIN_RESOLVED_EDGES = 100;

const edges = collectImports("src");
const files = listSourceFiles("src");

// Extensionless specifiers (`./cli/handlers`) resolve to the same module, so compare without `.ts`.
const withoutExtension = (file: string): string => file.replace(/\.ts$/, "");
const isLegacy = (file: string): boolean =>
  LEGACY.some((entry) => withoutExtension(file) === withoutExtension(entry) || file.startsWith(entry));
const isModule = (edge: ImportEdge, file: string): boolean =>
  edge.resolved !== undefined && withoutExtension(edge.resolved) === withoutExtension(file);
const isPackage = (edge: ImportEdge): boolean => edge.resolved === undefined;
const isNodeBuiltin = (edge: ImportEdge): boolean => edge.specifier.startsWith("node:");
const within = (prefix: string) => (edge: ImportEdge) => edge.resolved?.startsWith(prefix) ?? false;
const adapterOf = (file: string): string => file.split("/").slice(0, 3).join("/");

const violations = (
  isSubject: (file: string) => boolean,
  isAllowed: (edge: ImportEdge) => boolean,
): readonly string[] =>
  edges.filter((edge) => isSubject(edge.from) && !isAllowed(edge)).map((edge) => `${edge.from} -> ${edge.specifier}`);

describe("layer import rules", () => {
  test("0. every file under src/core imports only src/core", () => {
    expect(violations((file) => file.startsWith("src/core/"), within("src/core/"))).toEqual([]);
  });

  test("1. domain imports only domain: no package, no node builtin", () => {
    expect(violations((file) => file.startsWith(DOMAIN), within(DOMAIN))).toEqual([]);
  });

  test("2. ports import only domain", () => {
    expect(violations((file) => file.startsWith(PORTS), within(DOMAIN))).toEqual([]);
  });

  test("3. application imports only domain, ports and application", () => {
    const allowed = (edge: ImportEdge) => within(DOMAIN)(edge) || within(PORTS)(edge) || within(APPLICATION)(edge);
    expect(violations((file) => file.startsWith(APPLICATION), allowed)).toEqual([]);
  });

  test("4. adapters import only the core entry, the composition root, their own adapter, node and packages", () => {
    const subject = (file: string) => file.startsWith(ADAPTERS);
    const allowed = (edge: ImportEdge) =>
      isPackage(edge) ||
      isNodeBuiltin(edge) ||
      isModule(edge, CORE_ENTRY) ||
      isModule(edge, BOOTSTRAP) ||
      (edge.resolved?.startsWith(`${adapterOf(edge.from)}/`) ?? false);
    expect(violations(subject, allowed)).toEqual([]);
  });

  test("5. infrastructure imports only domain, ports, infrastructure, node and packages", () => {
    const allowed = (edge: ImportEdge) =>
      isPackage(edge) || within(DOMAIN)(edge) || within(PORTS)(edge) || within(INFRASTRUCTURE)(edge);
    expect(violations((file) => file.startsWith(INFRASTRUCTURE), allowed)).toEqual([]);
  });

  test("6. infrastructure is imported only by the composition root, main, infrastructure and LEGACY", () => {
    const offenders = edges
      .filter((edge) => within(INFRASTRUCTURE)(edge))
      .filter((edge) => ![BOOTSTRAP, MAIN].includes(edge.from))
      .filter((edge) => !edge.from.startsWith(INFRASTRUCTURE) && !isLegacy(edge.from))
      .map((edge) => `${edge.from} -> ${edge.specifier}`);
    expect(offenders).toEqual([]);
  });

  test("7. LEGACY is imported only by the composition root and LEGACY", () => {
    const offenders = edges
      .filter((edge) => edge.resolved !== undefined && isLegacy(edge.resolved))
      .filter((edge) => edge.from !== BOOTSTRAP && !isLegacy(edge.from))
      .map((edge) => `${edge.from} -> ${edge.specifier}`);
    expect(offenders).toEqual([]);
  });

  test("8. process output, exit, argv and console appear only in adapters and main", () => {
    const offenders = files
      .filter((file) => !file.startsWith(ADAPTERS) && file !== MAIN)
      .filter((file) => PROCESS_IO.test(readFileSync(file, "utf8")));
    const processImports = edges
      .filter((edge) => PROCESS_MODULES.has(edge.specifier))
      .filter((edge) => !edge.from.startsWith(ADAPTERS) && edge.from !== MAIN)
      .map((edge) => `${edge.from} -> ${edge.specifier}`);
    expect([...offenders, ...processImports]).toEqual([]);
  });

  test("9. every layer has files and the scan is not empty", () => {
    for (const layer of [DOMAIN, PORTS, APPLICATION, INFRASTRUCTURE, ADAPTERS]) {
      expect(files.filter((file) => file.startsWith(layer)).length, layer).toBeGreaterThanOrEqual(1);
    }
    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(edges.filter((edge) => edge.resolved !== undefined).length).toBeGreaterThanOrEqual(MIN_RESOLVED_EDGES);
  });
});
