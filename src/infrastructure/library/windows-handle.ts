import path from "node:path";
import koffi from "koffi";

// Native sharing rules pin the directory entry and deny writers until disposition is set on this very handle.
const kernel = koffi.load("kernel32.dll");
const create = kernel.func(
  "intptr_t __stdcall CreateFileW(str16 path, uint32_t access, uint32_t share, void *security, uint32_t mode, uint32_t flags, intptr_t templateHandle)",
);
const close = kernel.func("int __stdcall CloseHandle(intptr_t handle)");
const lastError = kernel.func("uint32_t __stdcall GetLastError()");
const info = kernel.func("int __stdcall GetFileInformationByHandle(intptr_t handle, void *info)");
const dispose = kernel.func(
  "int __stdcall SetFileInformationByHandle(intptr_t handle, int cls, void *data, uint32_t size)",
);
const driveType = kernel.func("uint32_t __stdcall GetDriveTypeW(str16 root)");
const volumeInfo = kernel.func(
  "int __stdcall GetVolumeInformationW(str16 root, void *name, uint32_t namesize, void *serial, void *maxComponent, void *flags, void *fsname, uint32_t fssize)",
);
const event = kernel.func("intptr_t __stdcall CreateEventW(void *attributes, int manual, int initial, str16 name)");
/** A kernel object, not a thread-owned mutex: concurrent saves in the same process also contend. */
export function claimWriter(id: string): (() => void) | undefined {
  const h = event(null, 1, 0, `Global\\pi-tube-source-${id}`);
  if (!h) throw failure();
  if (Number(lastError()) === 183) {
    close(h);
    return undefined;
  }
  return () => {
    close(h);
  };
}
const DELETE = 0x10000,
  ATTRIBUTES = 0x80,
  READ = 1,
  WRITE = 2,
  OPEN_EXISTING = 3;
const OPEN_REPARSE_POINT = 0x200000,
  BACKUP_SEMANTICS = 0x2000000;
export function filesystemError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
function failure(): Error {
  const n = Number(lastError());
  return Object.assign(new Error(`Windows filesystem error ${n}`), {
    code:
      ({ 2: "ENOENT", 3: "ENOENT", 32: "EBUSY", 33: "EBUSY", 145: "ENOTEMPTY" } as Record<number, string>)[n] ??
      `WIN32_${n}`,
  });
}
export function pin(file: string, kind: "ancestor" | "activity" | "prune-root" | "directory" | "file") {
  const deleting = !["activity", "ancestor"].includes(kind);
  const handle = create(
    path.toNamespacedPath(file),
    ATTRIBUTES | READ | (deleting ? DELETE : 0),
    READ | (kind === "activity" ? WRITE : 0),
    null,
    OPEN_EXISTING,
    (kind === "activity" ? 0 : OPEN_REPARSE_POINT) | BACKUP_SEMANTICS,
    0,
  );
  if (BigInt(handle) === -1n) throw failure();
  try {
    const data = Buffer.alloc(52); // BY_HANDLE_FILE_INFORMATION
    if (!info(handle, data)) throw failure();
    const flags = data.readUInt32LE();
    if ((flags & 0x400) !== 0 || Boolean(flags & 0x10) !== (kind !== "file"))
      throw filesystemError("ELOOP", "Not a plain entry");
    const inode = (BigInt(data.readUInt32LE(44)) << 32n) | BigInt(data.readUInt32LE(48));
    const birthtimeNs = (data.readBigUInt64LE(4) - 116444736000000000n) * 100n; // FILETIME to Unix ns
    return {
      handle,
      identity: `${data.readUInt32LE(28)}:${inode}:${birthtimeNs}`,
      close: () => {
        close(handle);
      },
      remove: () => {
        // FileDispositionInfoEx, DELETE | POSIX_SEMANTICS: unlink the opened entry, not a later pathname occupant.
        const disposition = Buffer.from([5, 0, 0, 0]);
        if (!dispose(handle, 21, disposition, 4)) throw failure();
      },
    };
  } catch (error) {
    close(handle);
    throw error;
  }
}

export function localVolumeFlags(dir: string) {
  const drive = path.parse(dir).root;
  // Drive-relative aliases, remote shares and volumes lacking POSIX disposition cannot use this backend.
  if (!/^[a-z]:\\$/i.test(drive) || ![2, 3].includes(driveType(drive)))
    throw filesystemError("ENOTSUP", "Not a local drive");
  const flags = Buffer.alloc(4);
  if (!volumeInfo(drive, null, 0, null, null, flags, null, 0)) throw failure();
  return flags.readUInt32LE();
}

export async function withPinnedRoot<T>(root: string, run: () => Promise<T>): Promise<T> {
  const dir = path.resolve(root);
  if (!(localVolumeFlags(dir) & 0x400)) throw filesystemError("ENOTSUP", "Volume lacks POSIX disposition");
  const parent = path.dirname(dir);
  // Verify every component while its parent remains pinned. Never open a child of a reparse point.
  const ancestors: string[] = [];
  for (let p = parent; p !== dir; p = path.dirname(p)) {
    ancestors.unshift(p);
    if (path.dirname(p) === p) break;
  }
  const handles: ReturnType<typeof pin>[] = [];
  try {
    for (const p of ancestors) handles.push(pin(p, "ancestor"));
    handles.push(pin(dir, "prune-root"));
    return await run();
  } finally {
    for (const h of handles.reverse()) h.close();
  }
}
