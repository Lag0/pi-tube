import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

// Exits at once but leaves a grandchild, in its own process group, holding stdout and stderr open for 2 s:
// the runner sees "exit" long before "close".
const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => {}, 2000)"], {
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
});
grandchild.unref();
writeFileSync(process.argv[2], String(grandchild.pid));
process.stdout.write("done");
