import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

// Spawns a grandchild that ignores nothing and sleeps, then records both PIDs for the test.
const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
writeFileSync(process.argv[2], JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));
setInterval(() => {}, 1000);
