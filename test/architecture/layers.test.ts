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

// Pre-v3 code that the core has not replaced yet. Shrinks to empty in phase 1b/1c.
const LEGACY = [
  "src/cli/handlers.ts",
  "src/cli/persist-output.ts",
  "src/intake/",
  "src/transcription/",
  "src/download/",
  "src/output/",
  "src/errors/",
];

const PROCESS_IO = /process\.(stdout|stderr|exit|argv)\b|console\./;

const edges = collectImports("src");
const files = listSourceFiles("src");

const isLegacy = (file: string): boolean => LEGACY.some((entry) => file === entry || file.startsWith(entry));
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
      edge.resolved === CORE_ENTRY ||
      edge.resolved === BOOTSTRAP ||
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
    expect(offenders).toEqual([]);
  });

  test("9. every layer has files and the scan is not empty", () => {
    for (const layer of [DOMAIN, PORTS, APPLICATION, INFRASTRUCTURE, ADAPTERS]) {
      expect(files.filter((file) => file.startsWith(layer)).length, layer).toBeGreaterThanOrEqual(1);
    }
    expect(files.length).toBeGreaterThanOrEqual(30);
  });
});
