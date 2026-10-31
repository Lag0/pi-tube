import { describe, expect, test } from "vitest";
import { isBlockedAddress } from "../../../src/core/domain/network-policy.ts";

describe("isBlockedAddress", () => {
  test.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.100.100.200",
    "0.0.0.0",
    "192.0.0.170",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::127.0.0.1",
    "fe80::1",
    "fe80::1%en0",
    "fec0::1",
    "fc00::1",
    "fd00:ec2::254",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "not-an-ip",
    "1.2.3",
    "256.1.1.1",
  ])("%s is blocked", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each([
    "8.8.8.8",
    "93.184.216.34",
    "172.32.0.1",
    "100.128.0.1",
    "192.0.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ])("%s is allowed", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});
