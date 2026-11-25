import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const entry = pathToFileURL(process.argv[2]);
const { pageAudioExtension } = await import(entry.href);
const worker = new URL("page-audio-worker.ts", entry);
const mode = process.argv[3];
if (mode === "intact") {
  const data = new SharedArrayBuffer(6 * 417);
  const bytes = Buffer.from(data);
  for (let at = 0; at < bytes.length; at += 417) bytes.writeUInt32BE(0xfffb9000, at);
  assert.equal(await pageAudioExtension(data, Date.now() + 5000), "mp3");
  for (const file of ["extensible.wav", "silence.ogg", "stereo.ogg", "5.1.ogg"]) {
    const bytes = readFileSync(path.join(process.argv[4], file));
    const input = new SharedArrayBuffer(bytes.length);
    Buffer.from(input).set(bytes);
    assert.equal(await pageAudioExtension(input, Date.now() + 5000), path.extname(file).slice(1));
  }
} else if (mode === "exit") {
  // A real worker with no message or pending handles. Only the temporary install is modified.
  writeFileSync(worker, "export {};\n");
  await assert.rejects(pageAudioExtension(new SharedArrayBuffer(4), Date.now() + 5000), /validation stopped/);
} else {
  writeFileSync(
    worker,
    `import {workerData} from "node:worker_threads";
    setInterval(() => {}, 1000); Atomics.store(new Int32Array(workerData), 0, 1);`,
  );
  const state = new Int32Array(new SharedArrayBuffer(4));
  const controller = new AbortController();
  let exited = false;
  const terminate = Worker.prototype.terminate;
  Worker.prototype.terminate = function () {
    this.once("exit", () => {
      exited = true;
    });
    return terminate.call(this);
  };
  const deadline = Date.now() + (mode === "timeout" ? 2000 : 5000);
  const result = assert.rejects(pageAudioExtension(state.buffer, deadline, controller.signal), /validation expired/);
  if (mode === "abort") {
    while (!Atomics.load(state, 0) && Date.now() < deadline) await delay(10);
    controller.abort();
  }
  await result;
  assert.equal(Atomics.load(state, 0), 1);
  assert(exited, "real worker must exit before validation returns");
  assert(Date.now() < deadline + (mode === "timeout" ? 1500 : 0));
}
console.log(`${mode} passed (Bun ${Bun.version})`);
