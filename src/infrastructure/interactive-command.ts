/**
 * Runs an installer (brew, npx skills) attached to the user's terminal and returns its exit code.
 * Only `pi-tube setup` uses it; it is never reachable from the MCP server, whose stdin is the protocol.
 */
export const runInteractiveCommand = (command: string, args: readonly string[]): number =>
  Bun.spawnSync({
    cmd: [command, ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  }).exitCode;
