import { parentPort, workerData } from "node:worker_threads";
import { parseBuffer } from "music-metadata";

// Metadata readers may stop after Tracks or a Xing header. Verify that media
// extents actually reach EOF before using their track information for dispatch.
function vint(bytes: Buffer, at: number, id = false) {
  const width = Math.clz32(bytes.readUInt8(at)) - 23;
  if (width > (id ? 4 : 8)) throw new Error("Invalid EBML integer");
  let value = bytes.readUInt8(at) & (id ? 0xff : 0xff >> width);
  let unknown = !id && value === 0xff >> width;
  for (let i = 1; i < width; i++) {
    const byte = bytes.readUInt8(at + i);
    unknown &&= byte === 0xff;
    value = value * 256 + byte;
  }
  return { value: unknown ? -1 : value, end: at + width };
}
function webmHasAudioBlocks(bytes: Buffer, track: number | undefined) {
  let found = false;
  function scan(start: number, end: number, parent: number) {
    for (let at = start; at < end; ) {
      const id = vint(bytes, at, true);
      const size = vint(bytes, id.end);
      const segment = parent === 0 && id.value === 0x18538067;
      const next = size.value === -1 && segment ? end : size.end + size.value;
      if (next < size.end || next > end) throw new Error("Incomplete WebM element");
      if (parent === 0 && !(at === 0 ? id.value === 0x1a45dfa3 : segment && next === end))
        throw new Error("Expected one WebM segment");
      if (segment || (parent === 0x18538067 && id.value === 0x1f43b675) || (parent === 0x1f43b675 && id.value === 0xa0))
        scan(size.end, next, id.value);
      else if ((parent === 0x1f43b675 && id.value === 0xa3) || (parent === 0xa0 && id.value === 0xa1)) {
        const blockTrack = vint(bytes, size.end);
        if (blockTrack.value === track && next > blockTrack.end + 3) found = true;
      }
      at = next;
    }
  }
  scan(0, bytes.length, 0);
  return found;
}

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

// Layer III frames have no outer container length. Walk frame lengths (including
// VBR) rather than trusting a bitrate estimate or accepting a partial last frame.
function completeMp3(bytes: Buffer) {
  let at = 0;
  if (bytes.toString("latin1", 0, 3) === "ID3") {
    let size = 0;
    for (const byte of bytes.subarray(6, 10)) {
      if (byte > 127) return false;
      size = size * 128 + byte;
    }
    at = 10 + size + (bytes[3] === 4 && bytes.readUInt8(5) & 16 ? 10 : 0);
  }
  const end =
    bytes.toString("latin1", bytes.length - 128, bytes.length - 125) === "TAG" ? bytes.length - 128 : bytes.length;
  const start = at;
  let frameCount: number | undefined;
  let byteCount: number | undefined;
  let frames = 0;
  while (at < end) {
    const h = bytes.readUInt32BE(at);
    const version = (h >>> 19) & 3;
    if (h >>> 21 !== 0x7ff || ((h >>> 17) & 3) !== 1 || version === 1) return false;
    const rates =
      version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const bitrate = rates[(h >>> 12) & 15];
    const rate = [44100, 48000, 32000][(h >>> 10) & 3];
    if (!rate || !bitrate) return false;
    const frameEnd = at + Math.floor(((version === 0 ? 288000 : 144000) * bitrate) / rate) + ((h >>> 9) & 1);
    if (!frames) {
      const mono = ((h >>> 6) & 3) === 3;
      const sideInfo = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
      const marker = at + 4 + sideInfo;
      if (["Xing", "Info"].includes(bytes.toString("latin1", marker, marker + 4))) {
        const flags = bytes.readUInt32BE(marker + 4);
        let field = marker + 8;
        if (flags & 1) {
          frameCount = bytes.readUInt32BE(field);
          field += 4;
        }
        if (flags & 2) {
          byteCount = bytes.readUInt32BE(field);
          field += 4;
        }
        if (field > frameEnd) return false;
      }
    }
    at = frameEnd;
    frames++;
  }
  // Xing counts audio frames after the header, but bytes including the header (not ID3).
  return (
    frames > 0 &&
    at === end &&
    (frameCount === undefined || frameCount === frames - 1) &&
    (byteCount === undefined || byteCount === end - start)
  );
}

async function pageAudioExtension(bytes: Buffer) {
  const mime =
    bytes.readUInt32BE(0) === 0x1a45dfa3
      ? "audio/webm"
      : bytes.toString("latin1", 4, 8) === "ftyp"
        ? "audio/mp4"
        : "audio/mpeg";
  if (mime === "audio/mpeg" && !completeMp3(bytes)) throw new Error("Unsupported or incomplete MPEG audio");
  const { format, quality } = await parseBuffer(bytes, mime, {
    duration: true,
    skipCovers: true,
    maxMemoryAllocation: 4 * 1024 * 1024,
    maxMetadataEntries: 4096,
  });
  const tracks = format.trackInfo ?? [];
  const audio = tracks.filter((t) => t.type === 2);
  const video = tracks.some((t) => t.type === 1);
  if (
    quality.warnings.length ||
    audio.length !== 1 ||
    audio[0]?.flagEnabled === false ||
    tracks.some((t) => t.type !== 1 && t.type !== 2)
  )
    throw new Error("Missing or ambiguous page audio");
  if (
    mime === "audio/webm" &&
    format.container === "EBML/webm" &&
    ["A_OPUS", "A_VORBIS"].includes(audio[0]?.codecId ?? "") &&
    webmHasAudioBlocks(bytes, audio[0]?.id)
  )
    return "webm";
  if (mime === "audio/mpeg" && format.container === "MPEG" && format.codec?.endsWith("Layer 3")) return "mp3";
  if (
    mime === "audio/mp4" &&
    audio[0]?.codecName &&
    !audio[0].codecName.startsWith("<") &&
    format.container?.split("/").some((brand) => /^(?:M4A|isom|iso[2-9]|mp4[12]|dash)$/u.test(brand)) &&
    tracks.every(
      (t) =>
        t.codecId &&
        !["enca", "encv"].includes(t.codecId) &&
        t.duration &&
        t.duration > 0 &&
        t.bitrate &&
        t.bitrate > 0,
    ) &&
    mp4Payload(bytes) === tracks.reduce((sum, t) => sum + Math.round(((t.duration ?? 0) * (t.bitrate ?? 0)) / 8), 0)
  )
    return video ? "mp4" : "m4a";
  throw new Error("Unsupported or incomplete page audio");
}

parentPort?.postMessage(await pageAudioExtension(Buffer.from(workerData)));
