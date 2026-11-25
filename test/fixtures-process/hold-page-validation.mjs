import { getEnvironmentData } from "node:worker_threads";

const { phase, state } = getEnvironmentData("hold-page-validation");
function hold() {
  Atomics.store(state, 0, 1);
  Atomics.wait(state, 0, 1, 10_000);
}
if (phase === "walk") {
  const read = Buffer.prototype.readUInt32BE;
  Buffer.prototype.readUInt32BE = function (at) {
    if (at === 323) hold(); // Second frame of the synthetic silence.mp3.
    return read.call(this, at);
  };
} else {
  const read = DataView.prototype.getUint32;
  DataView.prototype.getUint32 = function (...args) {
    if (new Error().stack.includes("music-metadata")) hold();
    return read.apply(this, args);
  };
}
