import { describe, expect, test } from "vitest";
import type { SourceSettings } from "../../../src/core/domain/source-settings.ts";
import { checkHost, type LookupHost } from "../../../src/infrastructure/media/host-guard.ts";

const SETTINGS: SourceSettings = { allowPrivateHosts: false, maxLocalFileBytes: 1_073_741_824 };

const fakeLookup = (answer: ReadonlyArray<{ address: string; family: number }> | Error) => {
  const hosts: string[] = [];
  const lookup: LookupHost = async (hostname) => {
    hosts.push(hostname);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { hosts, lookup };
};

describe("checkHost", () => {
  test("a host that resolves to loopback is SOURCE_HOST_BLOCKED", async () => {
    const { lookup } = fakeLookup([
      { address: "::1", family: 6 },
      { address: "127.0.0.1", family: 4 },
    ]);

    const result = await checkHost("http://localhost./x", SETTINGS, lookup, "site_metadata");

    expect(result.success ? undefined : result.error).toEqual({
      code: "SOURCE_HOST_BLOCKED",
      message: "Refusing `localhost.`: it resolves to a private, loopback or link-local address (::1).",
      hint: "pi-tube refuses private, loopback and link-local addresses. If you trust this host, run `pi-tube config set network.allow_private_hosts true`.",
    });
  });

  test.each(["http://2130706433/x", "http://0x7f.1/x", "http://[::ffff:127.0.0.1]/x"])(
    "%s is blocked without a DNS lookup",
    async (url) => {
      const { hosts, lookup } = fakeLookup([{ address: "93.184.216.34", family: 4 }]);

      const result = await checkHost(url, SETTINGS, lookup, "site_metadata");

      expect(result.success ? undefined : result.error.code).toBe("SOURCE_HOST_BLOCKED");
      expect(hosts).toEqual([]);
    },
  );

  test("one private address among public ones is enough to block", async () => {
    const { lookup } = fakeLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    const result = await checkHost("https://mixed.example/x", SETTINGS, lookup, "site_metadata");

    expect(result.success ? undefined : result.error.message).toContain("(10.0.0.5)");
  });

  test("a public host passes", async () => {
    const { hosts, lookup } = fakeLookup([{ address: "93.184.216.34", family: 4 }]);

    const result = await checkHost("https://example.com/x", SETTINGS, lookup, "site_metadata");

    expect(result.success).toBe(true);
    expect(hosts).toEqual(["example.com"]);
  });

  test("a failed lookup fails closed with the purpose's extraction error", async () => {
    const { lookup } = fakeLookup(
      Object.assign(new Error("getaddrinfo ENOTFOUND nope.invalid"), { code: "ENOTFOUND" }),
    );

    const result = await checkHost("https://nope.invalid/x", SETTINGS, lookup, "site_metadata");

    expect(result.success ? undefined : result.error.code).toBe("SOURCE_EXTRACT_FAILED");
    expect(result.success ? undefined : result.error.message).toContain(
      "cannot resolve host `nope.invalid` (ENOTFOUND)",
    );
  });

  test("allow_private_hosts skips the check and the lookup", async () => {
    const { hosts, lookup } = fakeLookup([{ address: "127.0.0.1", family: 4 }]);

    const result = await checkHost("http://localhost/x", { ...SETTINGS, allowPrivateHosts: true }, lookup, "download");

    expect(result.success).toBe(true);
    expect(hosts).toEqual([]);
  });
});
