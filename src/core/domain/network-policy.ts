// Pure SSRF policy: which IP addresses yt-dlp must never be pointed at. No `node:net`, so the domain stays portable.

type Bytes = readonly number[];

/** Four decimal octets only; DNS answers and WHATWG URL hosts are always in this form. */
const parseIpv4 = (text: string): Bytes | undefined => {
  const parts = text.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return undefined;
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : undefined;
};

/** Eight 16-bit groups, with `::` expanded and a trailing dotted IPv4 accepted; 16 bytes, or undefined. */
const parseIpv6 = (text: string): Bytes | undefined => {
  let hex = text;
  if (hex.includes(".")) {
    const lastColon = hex.lastIndexOf(":");
    const v4 = lastColon < 0 ? undefined : parseIpv4(hex.slice(lastColon + 1));
    if (!v4) return undefined;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    hex = `${hex.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = hex.split("::");
  if (halves.length > 2) return undefined;
  const groupsOf = (half: string | undefined): string[] | undefined => {
    if (half === undefined || half === "") return [];
    const groups = half.split(":");
    return groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group)) ? groups : undefined;
  };
  const head = groupsOf(halves[0]);
  const tail = groupsOf(halves[1]);
  if (!head || !tail) return undefined;
  const compressed = halves.length === 2;
  const missing = 8 - head.length - tail.length;
  if (compressed ? missing < 1 : missing !== 0) return undefined;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail].map((group) => Number.parseInt(group, 16));
  return groups.flatMap((group) => [group >> 8, group & 0xff]);
};

interface Block {
  readonly prefix: Bytes;
  readonly length: number;
}

const block = (cidr: string, parse: (text: string) => Bytes | undefined): Block => {
  const [address = "", length = ""] = cidr.split("/");
  const prefix = parse(address);
  if (!prefix) throw new Error(`invalid built-in block ${cidr}`);
  return { prefix, length: Number(length) };
};

/** Unspecified, private, CGNAT, loopback, link-local, IETF, benchmark, multicast and reserved IPv4 ranges. */
const BLOCKED_IPV4: readonly Block[] = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
].map((cidr) => block(cidr, parseIpv4));

/** Unspecified, loopback and IPv4-compatible, unique-local, link-local, site-local and multicast IPv6 ranges. */
const BLOCKED_IPV6: readonly Block[] = ["::/96", "fc00::/7", "fe80::/10", "fec0::/10", "ff00::/8"].map((cidr) =>
  block(cidr, parseIpv6),
);

const inBlock = (bytes: Bytes, { prefix, length }: Block): boolean => {
  const fullBytes = Math.floor(length / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  const remainingBits = length % 8;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return ((bytes[fullBytes] ?? 0) & mask) === ((prefix[fullBytes] ?? 0) & mask);
};

const isIpv4Mapped = (bytes: Bytes): boolean =>
  bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;

/**
 * Tells whether yt-dlp must not reach `address`: a private, loopback, link-local (cloud metadata included),
 * multicast or reserved address. An IPv4-mapped IPv6 address is judged by its IPv4 part, a `%zone` is ignored,
 * and anything that does not parse is blocked.
 */
export const isBlockedAddress = (address: string): boolean => {
  const bare = address.split("%")[0] ?? "";
  const v4 = parseIpv4(bare);
  if (v4) return BLOCKED_IPV4.some((range) => inBlock(v4, range));
  const v6 = parseIpv6(bare);
  if (!v6) return true;
  if (isIpv4Mapped(v6)) {
    const embedded = v6.slice(12);
    return BLOCKED_IPV4.some((range) => inBlock(embedded, range));
  }
  return BLOCKED_IPV6.some((range) => inBlock(v6, range));
};
