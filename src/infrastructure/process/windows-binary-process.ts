import koffi from "koffi";
import type { ProcessRequest, ProcessResult } from "./run-process.ts";
import { resolveWindowsExecutable } from "./windows-executable.ts";

const k = koffi.load("kernel32.dll");
const api = (signature: string) => k.func(signature);
const job = api("intptr_t __stdcall CreateJobObjectW(void *, void *)");
const configure = api("int __stdcall SetInformationJobObject(intptr_t, int, void *, uint32_t)");
const terminate = api("int __stdcall TerminateJobObject(intptr_t, uint32_t)");
const query = api("int __stdcall QueryInformationJobObject(intptr_t, int, void *, uint32_t, void *)");
const close = api("int __stdcall CloseHandle(intptr_t)");
const pipe = api("int __stdcall CreatePipe(void *, void *, void *, uint32_t)");
const inherit = api("int __stdcall SetHandleInformation(intptr_t, uint32_t, uint32_t)");
const file = api("intptr_t __stdcall CreateFileW(str16, uint32_t, uint32_t, void *, uint32_t, uint32_t, intptr_t)");
const init = api("int __stdcall InitializeProcThreadAttributeList(void *, uint32_t, uint32_t, void *)");
const update = api(
  "int __stdcall UpdateProcThreadAttribute(void *, uint32_t, uintptr_t, void *, size_t, void *, void *)",
);
const destroy = api("void __stdcall DeleteProcThreadAttributeList(void *)");
const start = api(
  "int __stdcall CreateProcessW(str16, void *, void *, void *, int, uint32_t, void *, str16, void *, void *)",
);
const peek = api("int __stdcall PeekNamedPipe(intptr_t, void *, uint32_t, void *, void *, void *)");
const read = api("int __stdcall ReadFile(intptr_t, void *, uint32_t, void *, void *)");
const wait = api("uint32_t __stdcall WaitForSingleObject(intptr_t, uint32_t)");
const status = api("int __stdcall GetExitCodeProcess(intptr_t, void *)");
const error = api("uint32_t __stdcall GetLastError()");
const width = koffi.sizeof("intptr_t");
const handleAt = (b: Buffer, offset = 0): number => Number(koffi.decode(b, offset, "intptr_t"));
const check = (ok: unknown) => {
  if (!ok) throw new Error("Native process supervision failed");
};
const wide = (text: string) => Buffer.from(`${text}\0`, "utf16le");
const quote = (text: string) => `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
const failed = (outcome: ProcessResult["outcome"]): ProcessResult => ({
  outcome,
  exitCode: null,
  stdout: "",
  stderr: "",
});

export async function runWindowsBinary(
  req: ProcessRequest,
  env: Record<string, string>,
  limit: number,
  deadline: number,
  { cwd, stdinPath, candidates }: { cwd: string; stdinPath: string; candidates: string[] },
): Promise<ProcessResult> {
  const stop = () => (req.signal?.aborted ? "aborted" : performance.now() >= deadline ? "timed_out" : undefined);
  const handles = new Set<number>();
  const own = (h: number) => {
    check(h && h !== -1);
    handles.add(h);
    return h;
  };
  const release = (h: number) => {
    check(close(h));
    handles.delete(h);
  };
  let attributes: ReturnType<typeof koffi.alloc>;
  let startedJob: number | undefined;
  const allocations: ReturnType<typeof koffi.alloc>[] = [];
  const allocate = (type: string, count: number) => {
    const ptr = koffi.alloc(type, count);
    allocations.push(ptr);
    return ptr;
  };
  try {
    // CreateProcessW consumes a sorted, double-NUL-terminated Unicode environment block.
    const entries = Object.entries(env).sort(([a], [b]) => (a.toUpperCase() < b.toUpperCase() ? -1 : 1));
    check(new Set(entries.map(([name]) => name.toUpperCase())).size === entries.length);
    check(
      req.stdinFd === undefined &&
        ![req.command, ...req.args, req.windowsBinaryStdinPath ?? "", ...Object.values(env)].some((s) =>
          s.includes("\0"),
        ),
    );
    const lookup = await resolveWindowsExecutable(candidates, deadline, req.signal);
    if ("outcome" in lookup) return failed(lookup.outcome);
    const j = own(job(null, null));
    // JOBOBJECT_EXTENDED_LIMIT_INFORMATION.BasicLimitInformation.LimitFlags
    const limits = Buffer.alloc(width === 8 ? 144 : 112);
    limits.writeUInt32LE(0x2000, 16);
    check(configure(j, 9, limits, limits.length));
    const makePipe = () => {
      const r = Buffer.alloc(width),
        w = Buffer.alloc(width);
      check(pipe(r, w, null, 65536));
      return [own(handleAt(r)), own(handleAt(w))] as const;
    };
    const [out, outW] = makePipe(),
      [err, errW] = makePipe();
    const input = own(file(stdinPath, 0x80000000, 7, null, 3, 0, 0));
    const stdio = [input, outW, errW];
    for (const h of stdio) check(inherit(h, 1, 1));
    const size = Buffer.alloc(width);
    init(null, 2, 0, size);
    const list = allocate("uint8_t", handleAt(size));
    check(init(list, 2, 0, size));
    attributes = list;
    const add = (id: number, values: number[]) => {
      const ref = allocate("intptr_t", values.length);
      koffi.encode(ref, "intptr_t", values, values.length);
      check(update(list, 0, id, ref, width * values.length, null, null));
    };
    add(0x20002, stdio); // PROC_THREAD_ATTRIBUTE_HANDLE_LIST
    add(0x2000d, [j]); // PROC_THREAD_ATTRIBUTE_JOB_LIST
    const startup = Buffer.alloc(width === 8 ? 112 : 72); // STARTUPINFOEXW
    startup.writeUInt32LE(startup.length);
    startup.writeUInt32LE(0x100, width === 8 ? 60 : 44);
    for (const [i, h] of stdio.entries()) koffi.encode(startup, startup.length - width * (4 - i), "intptr_t", h);
    koffi.encode(startup, startup.length - width, "void *", list);
    const pi = Buffer.alloc(width * 2 + 8);
    const stopped = stop();
    if (stopped) return failed(stopped);
    check(
      start(
        lookup.exe,
        wide([req.command, ...req.args].map(quote).join(" ")),
        null,
        null,
        1,
        0x08080400, // CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT
        wide(`${entries.map(([k, v]) => `${k}=${v}`).join("\0")}\0`),
        cwd,
        startup,
        pi,
      ),
    );
    startedJob = j;
    const processHandle = own(handleAt(pi));
    release(own(handleAt(pi, width)));
    for (const h of stdio) release(h);
    const chunks: Buffer[] = [];
    let bytes = 0;
    const count = Buffer.alloc(4);
    while (true) {
      const stopped = stop();
      if (stopped) return failed(stopped);
      let progress = false;
      for (const h of [out, err]) {
        if (!handles.has(h)) continue;
        if (!peek(h, null, 0, null, count, null)) {
          check(error() === 109); // ERROR_BROKEN_PIPE: every writer is closed
          release(h);
          continue;
        }
        // With exactly one reader, consuming only reported bytes cannot wait for the writer.
        const n = Math.min(count.readUInt32LE(), 65536);
        if (!n) continue;
        const buf = Buffer.allocUnsafe(n);
        check(read(h, buf, n, count, null));
        const chunk = buf.subarray(0, count.readUInt32LE());
        if (h === err) {
          bytes += chunk.length;
          if (bytes > limit) return failed("output_too_large");
          chunks.push(chunk);
        } else {
          try {
            req.writeStdout?.(chunk);
          } catch {
            return failed("sink_failed");
          }
        }
        progress = true;
      }
      if (!handles.has(out) && !handles.has(err)) {
        const state = wait(processHandle, 0);
        if (!state) break;
        check(state === 258);
      }
      await new Promise((resolve) => setTimeout(resolve, progress ? 0 : 5));
    }
    check(status(processHandle, count));
    const exitCode = count.readUInt32LE(),
      stderr = Buffer.concat(chunks).toString();
    if (exitCode) req.onBinaryFailureStderr?.(stderr);
    return { outcome: "exited", exitCode, stdout: "", stderr: stderr.trim() ? "Child reported diagnostics" : "" };
  } finally {
    try {
      // Closing the last job handle requests termination. Confirm quiescence before reporting success.
      if (startedJob !== undefined) {
        check(terminate(startedJob, 1));
        const accounting = Buffer.alloc(48); // JOBOBJECT_BASIC_ACCOUNTING_INFORMATION.ActiveProcesses
        const until = performance.now() + 5000;
        for (;;) {
          check(query(startedJob, 1, accounting, accounting.length, null));
          if (!accounting.readUInt32LE(40)) break;
          check(performance.now() < until);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
    } finally {
      if (attributes) destroy(attributes);
      for (const ptr of allocations) koffi.free(ptr);
      let closed = true;
      for (const h of handles) if (!close(h)) closed = false;
      check(closed);
    }
  }
}
