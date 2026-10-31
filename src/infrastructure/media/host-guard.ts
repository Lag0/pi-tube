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

/** Every address of `hostname`, in the order the resolver returns them. */
export const defaultLookup: LookupHost = (hostname) => lookup(hostname, { all: true, verbatim: true });

/**
 * Refuses a URL whose host is, or resolves to, a private, loopback or link-local address, before yt-dlp sees it.
 * Any blocked address blocks the host. A failed lookup fails closed with the purpose's extraction error.
 * `network.allow_private_hosts` skips the check. yt-dlp resolves the host again and follows redirects on its own,
 * so DNS rebinding and redirects are not covered.
 */
export const checkHost = async (
  url: string,
  settings: SourceSettings,
  lookupHost: LookupHost,
  purpose: YtDlpPurpose,
): Promise<Result<void>> => {
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
    try {
      addresses = (await lookupHost(host)).map((entry) => entry.address);
    } catch (error) {
      return err(extractionError(purpose, `cannot resolve host \`${host}\` (${errnoOf(error)})`));
    }
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
