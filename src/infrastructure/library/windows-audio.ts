import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import koffi from "koffi";
import { claimWriter, filesystemError, localVolumeFlags, pin } from "./windows-handle.ts";

const nt = koffi.load("ntdll.dll"),
  kernel = koffi.load("kernel32.dll");
const unicode = koffi.struct({ length: "uint16_t", maximum: "uint16_t", buffer: "str16" });
const attributes = koffi.struct({
  size: "uint32_t",
  root: "intptr_t",
  name: koffi.pointer(unicode),
  flags: "uint32_t",
  security: "void *",
  qos: "void *",
});
const create = nt.func("__stdcall", "NtCreateFile", "int32_t", [
  koffi.out(koffi.pointer("intptr_t")),
  "uint32_t",
  koffi.pointer(attributes),
  "void *",
  "void *",
  "uint32_t",
  "uint32_t",
  "uint32_t",
  "uint32_t",
  "void *",
  "uint32_t",
]);
const set = nt.func(
  "int32_t __stdcall NtSetInformationFile(intptr_t h, void *status, void *data, uint32_t length, uint32_t cls)",
);
const close = kernel.func("int __stdcall CloseHandle(intptr_t h)");
const info = kernel.func("int __stdcall GetFileInformationByHandle(intptr_t h, void *data)");
const read = kernel.func("int __stdcall ReadFile(intptr_t h, void *data, uint32_t size, void *count, void *overlap)");
const rewind = kernel.func(
  "int __stdcall SetFilePointerEx(intptr_t h, int64_t distance, void *position, uint32_t method)",
);
const write = kernel.func("int __stdcall WriteFile(intptr_t h, void *data, uint32_t size, void *count, void *overlap)");
const time = kernel.func("int __stdcall SetFileTime(intptr_t h, void *birth, void *access, void *modified)");
const convert = koffi
  .load("advapi32.dll")
  .func(
    "int __stdcall ConvertStringSecurityDescriptorToSecurityDescriptorW(str16 text,uint32_t revision,_Out_ void **descriptor, void *size)",
  );
const free = kernel.func("void *__stdcall LocalFree(void *ptr)");
const word = koffi.sizeof("intptr_t");
function unavailable(message: string): Error {
  return filesystemError("ENOTSUP", message);
}
function check(status: number) {
  if (status >= 0) return;
  const code = status >>> 0;
  // STATUS_OBJECT_NAME_COLLISION and STATUS_SHARING_VIOLATION are safe refusals, not a partial copy.
  if (code === 0xc0000035 || code === 0xc0000043) throw unavailable("Conflicting audio entry");
  throw new Error(`Windows audio operation failed: NTSTATUS 0x${code.toString(16)}`);
}
const OPEN = 1,
  CREATE = 2,
  OPEN_IF = 3;
// Only one normal component can be resolved relative to the verified directory (no streams or aliases).
function child(
  root: number | bigint,
  name: string,
  dir: boolean,
  disposition: number,
  stage = false,
  writableDirectory = false,
  removable = false,
) {
  if (
    name.includes(path.sep) ||
    /^(con|conin\$|conout\$|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name) ||
    !/^[^/:*?"<>|]+$/u.test(name) ||
    [...name].some((c) => c.charCodeAt(0) < 32) ||
    /[ .]$/.test(name) ||
    name.length > 255
  )
    throw unavailable("Invalid audio component");
  const out: [number | bigint] = [0];
  const acl: [unknown] = [null];
  if (disposition === CREATE && !convert(dir ? "D:P(A;OICI;FA;;;OW)" : "D:P(A;;FA;;;OW)", 1, acl, null))
    throw new Error("Cannot restrict audio access");
  try {
    check(
      create(
        out,
        0x100081 | (stage ? 0x10102 : removable ? 0x10000 : 0),
        {
          size: koffi.sizeof(attributes),
          root,
          name: { length: name.length * 2, maximum: name.length * 2 + 2, buffer: name },
          flags: 0x40,
          security: acl[0],
          qos: null,
        },
        Buffer.alloc(word * 2),
        null,
        0,
        stage ? 0 : writableDirectory ? 3 : 1,
        disposition,
        0x200020 | (dir ? 1 : 0x40),
        null,
        0,
      ),
    );
  } finally {
    if (acl[0]) free(acl[0]);
  }
  const h = out[0];
  try {
    const data = Buffer.alloc(52);
    if (!info(h, data)) throw new Error("Cannot verify audio entry");
    if (
      data.readUInt32LE() & 0x400 ||
      Boolean(data.readUInt32LE() & 16) !== dir ||
      (!dir && data.readUInt32LE(40) !== 1)
    )
      throw unavailable("Not an ordinary audio entry");
    return h;
  } catch (e) {
    try {
      if (stage) discardStage(h);
      if (removable && disposition === CREATE) {
        try {
          discardStage(h);
        } catch {
          process.emitWarning("Could not remove the newly created private download directory.");
        }
      }
    } finally {
      close(h);
    }
    throw e;
  }
}
function directories(dir: string, makeMissing = false) {
  dir = path.resolve(dir);
  if (!(localVolumeFlags(dir) & 8)) throw unavailable("Audio needs persistent access control on a local volume");
  const root = path.parse(dir).root;
  const first = pin(root, "ancestor");
  let h = first.handle;
  const handles = [h];
  const release = () => {
    for (const item of handles.reverse()) close(item);
  };
  try {
    for (const name of dir.slice(root.length).split(path.sep).filter(Boolean)) {
      h = child(h, name, true, makeMissing ? OPEN_IF : OPEN);
      handles.push(h);
    }
    return { handle: h, release };
  } catch (e) {
    release();
    throw e;
  }
}
// The provider reads by name, but retention can copy from the same delete-capable pin.
const downloads = new Map<string, number | bigint>();
const localAppData = koffi
  .load("shell32.dll")
  .func("int32_t __stdcall SHGetFolderPathW(intptr_t window, int folder, intptr_t token, uint32_t flags, void *path)");
export function localDownloadRoot() {
  const buffer = Buffer.alloc(520);
  if (localAppData(0, 0x1c, 0, 0, buffer) !== 0) throw unavailable("Local application data is unavailable");
  const local = buffer.toString("utf16le").split("\0")[0];
  if (!local || !path.isAbsolute(local)) throw unavailable("Invalid local application data folder");
  return path.join(local, "Temp");
}
export function privateDownload(dir: string, createParent = true) {
  const parent = directories(path.dirname(dir), createParent);
  try {
    const handle = child(parent.handle, path.basename(dir), true, CREATE, false, false, true);
    let released = false;
    let file: { path: string; handle: number | bigint } | undefined;
    return {
      hold(filePath: string) {
        if (released || file) throw unavailable("Download lease is not available");
        if (path.dirname(filePath) !== dir) throw unavailable("Download outside private directory");
        file = { path: filePath, handle: child(handle, path.basename(filePath), false, OPEN, false, false, true) };
        downloads.set(filePath, file.handle);
      },
      release() {
        if (released) return;
        released = true;
        try {
          if (file) {
            downloads.delete(file.path);
            try {
              discardStage(file.handle);
            } finally {
              close(file.handle);
            }
          }
          discardStage(handle);
        } finally {
          close(handle);
          parent.release();
        }
      },
    };
  } catch (e) {
    parent.release();
    throw e;
  }
}
function discardStage(stage: number | bigint) {
  // FileDispositionInformation targets the opened entry, never a later pathname lookup.
  if (set(stage, Buffer.alloc(word * 2), Buffer.from([1]), 1, 13) < 0)
    throw new Error("Could not discard the private audio stage");
}
function publishStage(input: number | bigint, dest: number | bigint, name: string, keptAt: Date) {
  const stage = child(dest, `.${randomUUID()}.tmp`, false, CREATE, true);
  let published = false;
  try {
    const bytes = Buffer.allocUnsafe(256 * 1024),
      count = Buffer.alloc(4);
    for (;;) {
      if (!read(input, bytes, bytes.length, count, null)) throw new Error("Audio read failed");
      const n = count.readUInt32LE();
      if (!n) break;
      if (!write(stage, bytes, n, count, null) || count.readUInt32LE() !== n) throw new Error("Audio write failed");
    }
    const stamp = Buffer.alloc(8);
    stamp.writeBigUInt64LE((BigInt(keptAt.getTime()) + 11644473600000n) * 10000n);
    if (!time(stage, null, stamp, stamp)) throw new Error("Cannot set audio time");
    // FILE_RENAME_INFORMATION: ReplaceIfExists stays false; RootDirectory names the pinned destination.
    const rename = Buffer.alloc(2 * word + 4 + name.length * 2);
    if (word === 8) rename.writeBigUInt64LE(BigInt(dest), word);
    else rename.writeUInt32LE(Number(dest), word);
    rename.writeUInt32LE(name.length * 2, 2 * word);
    rename.write(name, 2 * word + 4, "utf16le");
    check(set(stage, Buffer.alloc(word * 2), rename, rename.length, 10));
    published = true;
  } finally {
    try {
      if (!published) discardStage(stage);
    } finally {
      close(stage);
    }
  }
}
export function publishDownloadedAudio(file: string, dir: string, name: string, keptAt: Date) {
  if (!/^audio\.[a-z0-9]+$/i.test(name)) throw unavailable("Unsupported audio extension");
  const release: Array<() => void> = [];
  try {
    let input = downloads.get(file);
    if (input === undefined) {
      const source = directories(path.dirname(file));
      release.push(source.release);
      const opened = child(source.handle, path.basename(file), false, OPEN);
      release.push(() => close(opened));
      input = opened;
    } else if (!rewind(input, 0, null, 0)) throw new Error("Cannot rewind downloaded audio");
    const parent = directories(path.dirname(dir));
    release.push(parent.release);
    // A relative rename needs write sharing on its parent. With no delete sharing, its entry cannot move.
    const dest = child(parent.handle, path.basename(dir), true, OPEN_IF, false, true);
    release.push(() => close(dest));
    const identity = Buffer.alloc(52);
    if (!info(dest, identity)) throw new Error("Cannot identify destination");
    const unlock = claimWriter(`audio-${identity.readUInt32LE(28)}-${identity.readBigUInt64LE(44)}`);
    if (!unlock) throw unavailable("Concurrent audio publication");
    release.push(unlock);
    // Enumeration is the only pathname read. Deny writers/reparse changes on the leaf during it, too.
    const scan = child(parent.handle, path.basename(dir), true, OPEN);
    try {
      if (readdirSync(dir).some((n) => /^audio\./i.test(n))) throw unavailable("Existing audio was preserved");
    } finally {
      close(scan);
    }
    publishStage(input, dest, name, keptAt);
  } finally {
    for (const done of release.reverse()) done();
  }
}
