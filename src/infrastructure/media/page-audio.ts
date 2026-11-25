import { closeSync, openSync, read } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { parseBuffer } from "music-metadata";

// A successful metadata parse can stop before the WebM trailer. Require a finite,
// complete EBML Segment, not just readable Tracks near the beginning.
function elementEnd(bytes: Buffer, offset: number, id: number) {
  if (bytes.readUInt32BE(offset) !== id) return -1;
  const at = offset + 4;
  const first = bytes.readUInt8(at);
  if (!first) return -1;
  const width = Math.clz32(first) - 23;
  let size = first & (0xff >> width);
  for (let i = 1; i < width; i++) size = size * 256 + bytes.readUInt8(at + i);
  if (!Number.isSafeInteger(size) || size === 2 ** (7 * width) - 1) return -1;
  return at + width + size;
}

// Compare container extents with the parser's sample-byte total. Metadata alone can
// survive a missing media payload. Unknown/extended sizes are outside this draft.
function mp4Payload(bytes: Buffer) {
  let payload = 0;
  for (let at = 0; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    if (length < 8 || length > bytes.length - at) throw new Error("Incomplete or unsupported MP4 box");
    if (bytes.readUInt32BE(at + 4) === 0x6d646174) payload += length - 8;
    at += length;
  }
  return payload;
}
const readInto = promisify(read);
export async function validatePageAudio(bytes: Buffer, extension: string) {
  if (extension === "webm") {
    const headerEnd = elementEnd(bytes, 0, 0x1a45dfa3);
    if (headerEnd < 0 || elementEnd(bytes, headerEnd, 0x18538067) !== bytes.length)
      throw new Error("Incomplete or unsized WebM segment");
  }
  if (extension === "m4a" && bytes.toString("latin1", 4, 8) !== "ftyp") throw new Error("Unsupported MP4 container");
  const { format, quality } = await parseBuffer(bytes, extension === "webm" ? "audio/webm" : "audio/mp4", {
    skipCovers: true,
    maxMemoryAllocation: 4 * 1024 * 1024,
    maxMetadataEntries: 4096,
  });
  const [track] = format.trackInfo ?? [];
  if (
    quality.warnings.length ||
    format.trackInfo?.length !== 1 ||
    track?.type !== 2 ||
    !(format.duration && format.duration > 0) ||
    !(extension === "webm"
      ? format.container === "EBML/webm" && track.codecId === "A_OPUS"
      : track.codecId === "mp4a" &&
        format.codec === "MPEG-4/AAC" &&
        track.bitrate &&
        track.duration &&
        mp4Payload(bytes) === Math.round((track.bitrate * track.duration) / 8))
  )
    throw new Error("Expected single-track AAC in MP4 or Opus in WebM");
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
        const bytes = Buffer.allocUnsafe(size);
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
