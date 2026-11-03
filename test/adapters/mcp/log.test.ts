import { describe, expect, test } from "vitest";
import { createMcpLogger } from "../../../src/adapters/mcp/log.ts";

const NOW = new Date("2026-11-02T12:00:00.000Z");

const logger = (env: Record<string, string> = {}) => {
  const lines: string[] = [];
  const log = createMcpLogger({ env, writeErr: (line) => lines.push(line), now: () => NOW });
  return { log, lines };
};

describe("createMcpLogger", () => {
  test("the default level is warn: info and debug are dropped", () => {
    const { log, lines } = logger();

    log.error("e");
    log.warn("w");
    log.info("i");
    log.debug("d");

    expect(lines).toEqual([`${NOW.toISOString()} error e\n`, `${NOW.toISOString()} warn w\n`]);
  });

  test("PI_TUBE_LOG_LEVEL=debug keeps every level, and text lines carry the fields", () => {
    const { log, lines } = logger({ PI_TUBE_LOG_LEVEL: "debug" });

    log.debug("v2 import", { found: 2, path: "a b" });

    expect(lines).toEqual([`${NOW.toISOString()} debug v2 import found=2 path="a b"\n`]);
  });

  test("PI_TUBE_LOG_LEVEL=error drops warn", () => {
    const { log, lines } = logger({ PI_TUBE_LOG_LEVEL: "error" });

    log.warn("w");

    expect(lines).toEqual([]);
  });

  test("PI_TUBE_LOG_FORMAT=json writes one JSON line with time, level, message and the fields", () => {
    const { log, lines } = logger({ PI_TUBE_LOG_FORMAT: "json" });

    log.warn("Audit log not written", { code: "STORAGE_IO_FAILED" });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith("\n")).toBe(true);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      time: NOW.toISOString(),
      level: "warn",
      message: "Audit log not written",
      code: "STORAGE_IO_FAILED",
    });
  });

  test("a field cannot overwrite time, level or message in a JSON line", () => {
    const { log, lines } = logger({ PI_TUBE_LOG_FORMAT: "json" });

    log.warn("v2 import failed", { message: "EACCES", level: "debug", time: "x", code: "STORAGE_IO_FAILED" });

    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      time: NOW.toISOString(),
      level: "warn",
      message: "v2 import failed",
      code: "STORAGE_IO_FAILED",
    });
  });

  test("an invalid PI_TUBE_LOG_LEVEL uses warn and says so once", () => {
    const { log, lines } = logger({ PI_TUBE_LOG_LEVEL: "loud" });

    log.info("i");
    log.warn("w");

    expect(lines).toEqual([
      `${NOW.toISOString()} warn PI_TUBE_LOG_LEVEL must be error, warn, info or debug; using warn.\n`,
      `${NOW.toISOString()} warn w\n`,
    ]);
  });

  test("a message cannot forge another log line", () => {
    const { log, lines } = logger();

    log.warn("a\nb", { note: "c\nd" });

    expect(lines).toEqual([`${NOW.toISOString()} warn a b note="c\\nd"\n`]);
  });
});
