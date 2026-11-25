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
  let countedBytesStart = at;
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
      } else if (
        at + 42 <= frameEnd &&
        bytes.toString("latin1", at + 36, at + 40) === "VBRI" &&
        bytes.readUInt16BE(at + 40) === 1
      ) {
        if (at + 62 > frameEnd) return false;
        byteCount = bytes.readUInt32BE(at + 46);
        frameCount = bytes.readUInt32BE(at + 50);
        countedBytesStart = frameEnd;
      }
    }
    at = frameEnd;
    frames++;
  }
  // Both tags count following audio frames. Only Xing/Info include the header frame in bytes.
  return (
    frames > 0 &&
    at === end &&
    (frameCount === undefined || frameCount === frames - 1) &&
    (byteCount === undefined || byteCount === end - countedBytesStart)
  );
}

function completeWave(bytes: Buffer) {
  if (bytes.toString("latin1", 8, 12) !== "WAVE" || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  let align = 0;
  let data = false;
  for (let at = 12; at < bytes.length; ) {
    const id = bytes.toString("latin1", at, at + 4);
    const size = bytes.readUInt32LE(at + 4);
    at += 8;
    if (at + size + (size % 2) > bytes.length) return false;
    if (id === "fmt ") {
      if (align || size < 16) return false;
      const tag = bytes.readUInt16LE(at);
      const width = bytes.readUInt16LE(at + 14);
      if (tag === 0xfffe) {
        // Microsoft's WAVEFORMATEXTENSIBLE: valid precision is independent of the byte-sized container.
        if (size < 40) return false;
        const extra = bytes.readUInt16LE(at + 16);
        const valid = bytes.readUInt16LE(at + 18);
        if (
          extra < 22 ||
          18 + extra > size ||
          width % 8 ||
          !valid ||
          valid > width ||
          bytes.toString("hex", at + 24, at + 40) !== "0100000000001000800000aa00389b71"
        )
          return false;
      } else if (tag !== 1) return false;
      const channels = bytes.readUInt16LE(at + 2);
      const rate = bytes.readUInt32LE(at + 4);
      align = bytes.readUInt16LE(at + 12);
      if (!align || !rate || align !== channels * Math.ceil(width / 8) || bytes.readUInt32LE(at + 8) !== align * rate)
        return false;
    } else if (id === "data") {
      if (data || !align || !size || size % align) return false;
      data = true;
    }
    at += size + (size % 2);
  }
  return data;
}

// Left-align the polynomial so the same byte update works for CRC-8, -16 and -32.
function crcTable(polynomial: number) {
  return Uint32Array.from({ length: 256 }, (_, byte) => {
    let crc = byte << 24;
    for (let bit = 0; bit < 8; bit++) crc = (crc << 1) ^ (crc < 0 ? polynomial : 0);
    return crc;
  });
}
const oggCrc = crcTable(0x04c11db7);
const frameCrc = crcTable(0x80050000);
const headerCrc = crcTable(0x07000000);
function crcByte(table: Uint32Array, crc: number, byte: number) {
  return ((crc << 8) ^ (table[(crc >>> 24) ^ byte] ?? 0)) >>> 0;
}

// RFC 7845 section 5.1: version 1, mono/stereo or Vorbis surround mapping.
function validOpusHead(packet: Buffer) {
  if (packet.length < 19 || packet.toString("latin1", 0, 8) !== "OpusHead" || packet[8] !== 1) return false;
  const channels = packet.readUInt8(9);
  if (!channels) return false;
  if (packet[18] === 0) return channels <= 2 && packet.length === 19;
  if (packet[18] !== 1 || channels > 8 || packet.length !== 21 + channels) return false;
  const streams = packet.readUInt8(19);
  const coupled = packet.readUInt8(20);
  const decoded = streams + coupled;
  return (
    streams > 0 && coupled <= streams && decoded <= 255 && packet.subarray(21).every((c) => c === 255 || c < decoded)
  );
}

function completeOpus(bytes: Buffer) {
  const serial = bytes.readUInt32LE(14);
  let lastGranule = 0n;
  let sequence = 0,
    packets = 0,
    continued = false;
  for (let at = 0; at < bytes.length; ) {
    const flags = bytes.readUInt8(at + 5);
    if (
      bytes.toString("latin1", at, at + 4) !== "OggS" ||
      bytes[at + 4] !== 0 ||
      flags > 7 ||
      Boolean(flags & 1) !== continued ||
      Boolean(flags & 2) !== (sequence === 0) ||
      bytes.readUInt32LE(at + 14) !== serial ||
      bytes.readUInt32LE(at + 18) !== sequence++
    )
      return false;
    const priorPackets = packets;
    const segments = bytes.readUInt8(at + 26);
    const payload = at + 27 + segments;
    let end = payload;
    for (let i = at + 27; i < at + 27 + segments; i++) {
      const length = bytes.readUInt8(i);
      if (!continued && (!length || (packets === 1 && bytes.toString("latin1", end, end + 8) !== "OpusTags")))
        return false;
      end += length;
      continued = length === 255;
      if (!continued) packets++;
    }
    if (end > bytes.length || Boolean(flags & 4) !== (end === bytes.length)) return false;
    const granule = bytes.readBigInt64LE(at + 6);
    if (
      sequence === 1 &&
      (packets !== 1 || continued || granule !== 0n || !validOpusHead(bytes.subarray(payload, end)))
    )
      return false;
    if (packets === priorPackets) {
      if (granule !== -1n) return false;
    } else {
      if (granule < lastGranule || (packets <= 2 && granule !== 0n)) return false;
      lastGranule = granule;
    }
    let crc = 0;
    for (let i = at; i < end; i++) crc = crcByte(oggCrc, crc, i >= at + 22 && i < at + 26 ? 0 : bytes.readUInt8(i));
    if (crc !== bytes.readUInt32LE(at + 22)) return false;
    at = end;
  }
  return !continued && packets > 2 && lastGranule > 0n;
}

// Use frame/header CRCs and block counts, not STREAMINFO duration alone. No sample decoding.
function completeFlac(bytes: Buffer) {
  if ((bytes.readUInt8(4) & 127) !== 0 || bytes.readUIntBE(5, 3) !== 34) return false;
  const minBlock = bytes.readUInt16BE(8),
    maxBlock = bytes.readUInt16BE(10);
  const sampleRate = bytes.readUIntBE(18, 3) >> 4;
  const channels = ((bytes.readUInt8(20) >> 1) & 7) + 1;
  const depth = ((bytes.readUInt16BE(20) >> 4) & 31) + 1;
  if (minBlock < 16 || minBlock > maxBlock || !sampleRate || depth < 4) return false;
  const total = bytes.readUIntBE(21, 5) % 2 ** 36;
  const minSize = bytes.readUIntBE(12, 3),
    maxSize = bytes.readUIntBE(15, 3);
  let at = 4;
  for (;;) {
    const type = bytes.readUInt8(at);
    if ((type & 127) === 127 || (at > 4 && !(type & 127))) return false;
    at += 4 + bytes.readUIntBE(at + 1, 3);
    if (type & 128) break;
  }
  let samples = 0,
    frames = 0;
  while (at < bytes.length) {
    const start = at;
    const sync = bytes.readUInt16BE(at);
    const spec = bytes.readUInt8(at + 2),
      block = spec >> 4,
      rate = spec & 15;
    const channel = bytes.readUInt8(at + 3);
    if ((sync & 0xfffe) !== 0xfff8 || !block || rate === 15 || channel >> 4 > 10 || channel & 1 || (channel & 14) === 6)
      return false;
    const assignment = channel >> 4;
    const frameDepth = [depth, 8, 12, 0, 16, 20, 24, 32][(channel >> 1) & 7];
    if (channels !== (assignment < 8 ? assignment + 1 : 2) || depth !== frameDepth) return false;
    at += 4;
    const first = bytes.readUInt8(at++);
    const width = Math.clz32((~first & 255) << 24);
    if (width === 1 || width > 7) return false;
    let number = first & (127 >> width);
    for (let i = 1; i < width; i++) {
      const next = bytes.readUInt8(at++);
      if ((next & 192) !== 128) return false;
      number = number * 64 + (next & 63);
    }
    if (number !== (sync & 1 ? samples : frames)) return false;
    const count =
      block === 6 || block === 7
        ? bytes.readUIntBE(at, block - 5) + 1
        : block === 1
          ? 192
          : block < 6
            ? 576 << (block - 2)
            : 256 << (block - 8);
    at += block === 6 || block === 7 ? block - 5 : 0;
    const frameRate =
      rate === 12
        ? bytes.readUInt8(at) * 1000
        : rate >= 13
          ? bytes.readUInt16BE(at) * (rate === 14 ? 10 : 1)
          : [sampleRate, 88200, 176400, 192000, 8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000][rate];
    if (count > maxBlock || frameRate !== sampleRate) return false;
    at += rate === 12 ? 1 : rate >= 13 ? 2 : 0;
    let header = 0,
      crc = 0;
    for (let i = start; i <= at; i++) header = crcByte(headerCrc, header, bytes.readUInt8(i));
    if (header || at + 4 > bytes.length) return false;
    // A frame ends at EOF or the next sync, with a matching CRC-16 footer.
    const minEnd = Math.max(at + 4, start + minSize);
    for (at = start; at < bytes.length; ) {
      crc = crcByte(frameCrc, crc, bytes.readUInt8(at++));
      if (maxSize && at - start > maxSize) return false;
      if (!crc && at >= minEnd && (at === bytes.length || (bytes[at] === 255 && ((bytes[at + 1] ?? 0) & 254) === 248)))
        break;
    }
    if (crc || at < minEnd || (at < bytes.length && count < minBlock)) return false;
    frames++;
    samples += count;
  }
  return frames > 0 && (!total || samples === total);
}

function pageAudioMime(bytes: Buffer) {
  switch (bytes.toString("latin1", 0, 4)) {
    case "OggS":
      return "audio/ogg";
    case "fLaC":
      return "audio/flac";
    case "RIFF":
      return "audio/wav";
  }
  if (bytes.readUInt32BE(0) === 0x1a45dfa3) return "audio/webm";
  return bytes.toString("latin1", 4, 8) === "ftyp" ? "audio/mp4" : "audio/mpeg";
}

async function pageAudioExtension(bytes: Buffer) {
  const mime = pageAudioMime(bytes);
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
  if (!video && mime === "audio/ogg" && format.container === "Ogg" && format.codec === "Opus" && completeOpus(bytes))
    return "ogg";
  if (!video && mime === "audio/flac" && format.container === "FLAC" && format.codec === "FLAC" && completeFlac(bytes))
    return "flac";
  if (!video && mime === "audio/wav" && format.container === "WAVE" && format.codec === "PCM" && completeWave(bytes))
    return "wav";
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
