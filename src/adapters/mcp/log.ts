import { type EnvironmentVariables, toSafeLine } from "../../core/index.ts";

/** How much the MCP server logs, most severe first. */
export type LogLevel = "error" | "warn" | "info" | "debug";

/** Writes one log line when its level is on; `fields` are appended as `key=value` (text) or JSON keys. */
export type LogFn = (message: string, fields?: Readonly<Record<string, unknown>>) => void;

/** The MCP server's log, on stderr: stdout carries only MCP messages. */
export interface McpLogger {
  readonly error: LogFn;
  readonly warn: LogFn;
  readonly info: LogFn;
  readonly debug: LogFn;
}

const LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug"];

/** PI_TUBE_LOG_LEVEL (default warn) and PI_TUBE_LOG_FORMAT (text|json, default text); writes only through `writeErr`. */
export const createMcpLogger = (input: {
  readonly env: EnvironmentVariables;
  readonly writeErr: (line: string) => void;
  readonly now?: () => Date;
}): McpLogger => {
  const now = input.now ?? (() => new Date());
  const rawLevel = input.env.PI_TUBE_LOG_LEVEL?.trim().toLowerCase();
  const level = LEVELS.find((candidate) => candidate === rawLevel);
  const rawFormat = input.env.PI_TUBE_LOG_FORMAT?.trim().toLowerCase();
  const json = rawFormat === "json";
  const enabled = LEVELS.slice(0, LEVELS.indexOf(level ?? "warn") + 1);

  const write = (lineLevel: LogLevel, message: string, fields: Readonly<Record<string, unknown>> = {}): void => {
    if (!enabled.includes(lineLevel)) return;
    const time = now().toISOString();
    if (json) {
      input.writeErr(`${JSON.stringify({ time, level: lineLevel, message, ...fields })}\n`);
      return;
    }
    // JSON-quoted values and a single-line message: a value from a page or a file name cannot forge a log line.
    const pairs = Object.entries(fields).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
    input.writeErr(`${[time, lineLevel, toSafeLine(message), ...pairs].join(" ")}\n`);
  };

  const logger: McpLogger = {
    error: (message, fields) => write("error", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    info: (message, fields) => write("info", message, fields),
    debug: (message, fields) => write("debug", message, fields),
  };
  if (rawLevel !== undefined && rawLevel.length > 0 && level === undefined) {
    logger.warn("PI_TUBE_LOG_LEVEL must be error, warn, info or debug; using warn.");
  }
  if (rawFormat !== undefined && rawFormat.length > 0 && !json && rawFormat !== "text") {
    logger.warn("PI_TUBE_LOG_FORMAT must be text or json; using text.");
  }
  return logger;
};
