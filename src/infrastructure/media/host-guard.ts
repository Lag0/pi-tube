import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createError } from "../../core/domain/errors.ts";
import { isBlockedAddress } from "../../core/domain/network-policy.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import type { SourceSettings } from "../../core/domain/source-settings.ts";
import { errnoOf } from "../errno.ts";
import { extractionError, type YtDlpPurpose } from "./yt-dlp.ts";

/** Resolves a host name to every address it has; injected so no test resolves real DNS. */
export type LookupHost = (
  hostname: string,
) => Promise<ReadonlyArray<{ readonly address: string; readonly family: number }>>;

/** How long a host lookup may take; the system resolver has no timeout of its own. */
export const DNS_TIMEOUT_MS = 10_000;

type Raced<T> =
  | { readonly kind: "done"; readonly value: T }
  | { readonly kind: "aborted" }
  | { readonly kind: "timed_out" };

/**
 * Waits for `work` until `signal` aborts or `timeoutMs` passes. The lookup itself cannot be cancelled (it runs in
 * the resolver's thread pool); pi-tube just stops waiting for it.
 */
const race = <T>(work: Promise<T>, signal: AbortSignal | undefined, timeoutMs: number): Promise<Raced<T>> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({ kind: "aborted" });
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => finish({ kind: "aborted" });
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (outcome: Raced<T>): void => {
      cleanup();
      resolve(outcome);
    };
    timer = setTimeout(() => finish({ kind: "timed_out" }), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => finish({ kind: "done", value }),
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });

/** Every address of `hostname`, in the order the resolver returns them. */
export const defaultLookup: LookupHost = (hostname) => lookup(hostname, { all: true, verbatim: true });

/**
 * Refuses a URL whose host is, or resolves to, a private, loopback or link-local address, before yt-dlp sees it.
 * Any blocked address blocks the host. A failed lookup fails closed with the purpose's extraction error.
 * `network.allow_private_hosts` skips the check. yt-dlp resolves the host again and follows redirects on its own,
 * so DNS rebinding and redirects are not covered. An aborted `signal` is CANCELLED, also mid-lookup; a lookup that
 * takes longer than `timeoutMs` (default `DNS_TIMEOUT_MS`) fails like a failed lookup.
 */
export const checkHost = async (
  url: string,
  settings: SourceSettings,
  lookupHost: LookupHost,
  purpose: YtDlpPurpose,
  options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<Result<void>> => {
  if (options.signal?.aborted) return err(createError("CANCELLED", "Operation cancelled."));
  if (settings.allowPrivateHosts) return ok(undefined);
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return err(extractionError(purpose, `invalid URL \`${url}\``));
  }
  const host = hostname.replace(/^\[|\]$/g, "");

  let addresses: readonly string[];
  if (isIP(host) !== 0) {
    addresses = [host];
  } else {
    const timeoutMs = options.timeoutMs ?? DNS_TIMEOUT_MS;
    let looked: Raced<Awaited<ReturnType<LookupHost>>>;
    try {
      looked = await race(lookupHost(host), options.signal, timeoutMs);
    } catch (error) {
      return err(extractionError(purpose, `cannot resolve host \`${host}\` (${errnoOf(error)})`));
    }
    if (looked.kind === "aborted") return err(createError("CANCELLED", "Operation cancelled."));
    if (looked.kind === "timed_out") {
      return err(
        extractionError(purpose, `cannot resolve host \`${host}\` (timed out after ${Math.round(timeoutMs / 1000)}s)`),
      );
    }
    addresses = looked.value.map((entry) => entry.address);
    if (addresses.length === 0) return err(extractionError(purpose, `cannot resolve host \`${host}\` (no address)`));
  }

  const blocked = addresses.find(isBlockedAddress);
  if (blocked === undefined) return ok(undefined);
  return err(
    createError(
      "SOURCE_HOST_BLOCKED",
      `Refusing \`${host}\`: it resolves to a private, loopback or link-local address (${blocked}).`,
    ),
  );
};
