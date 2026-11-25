import { closeSync, openSync, read } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";

const readInto = promisify(read);
export async function pageAudioExtension(buffer: SharedArrayBuffer, deadline: number, signal?: AbortSignal) {
  if (Date.now() >= deadline || signal?.aborted) throw new Error("Page audio validation expired");
  const worker = new Worker(new URL("./page-audio-worker.ts", import.meta.url), { workerData: buffer });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      stop = () => reject(new Error("Page audio validation expired"));
      timer = setTimeout(stop, Math.max(1, deadline - Date.now()));
      signal?.addEventListener("abort", stop, { once: true });
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", () => reject(new Error("Page audio validation stopped")));
    });
  } finally {
    clearTimeout(timer);
    if (stop) signal?.removeEventListener("abort", stop);
    await worker.terminate();
  }
}
export function pageAudioSink(
  dir: string,
  limit: number,
  privateDownload: { create(name: string): (chunk: Buffer) => void },
) {
  let file = "",
    extension = "",
    size = 0,
    exceeded = false;
  let write: ((chunk: Buffer) => void) | undefined;
  return {
    get path() {
      return file;
    },
    get extension() {
      return extension;
    },
    get exceeded() {
      return exceeded;
    },
    get size() {
      return size;
    },
    write(chunk: Buffer) {
      if (!chunk.length) return;
      if (exceeded || chunk.length > limit - size) {
        exceeded = true;
        throw new Error("Page audio exceeds local_files.max_bytes");
      }
      if (!write) {
        // Only chooses a candidate parser/output name. Never authorizes an upload.
        extension = chunk[0] === 0x47 ? "ts" : chunk[0] === 0x1a ? "webm" : "m4a";
        const name = `audio.${extension}`;
        file = path.join(dir, name);
        write = privateDownload.create(name);
      }
      write(chunk);
      size += chunk.length;
    },
    async bytes(check: () => void) {
      const reader = openSync(file, "r");
      try {
        const bytes = Buffer.from(new SharedArrayBuffer(size));
        for (let at = 0; at < size; ) {
          check();
          const { bytesRead: n } = await readInto(reader, bytes, at, Math.min(256 * 1024, size - at), at);
          if (!n) throw new Error("Incomplete page audio");
          at += n;
        }
        return bytes;
      } finally {
        closeSync(reader);
      }
    },
  };
}
