const HOST_PATTERN =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const MAX_HOST_LENGTH = 253;

function isIPv4(labels: string[]): boolean {
  return (
    labels.length === 4 &&
    labels.every(
      (l) =>
        /^\d+$/.test(l) &&
        (l === "0" || !l.startsWith("0")) &&
        Number(l) <= 255,
    )
  );
}

// Turns "HTTPS://Pos.Example.com:3000/till?x=1" into "pos.example.com:3000".
// Returns null when the input is not a valid host or host:port.
export function normaliseHost(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (s === "") return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/, 1)[0] ?? "";
  const parts = s.split(":");
  if (parts.length > 2) return null; // IPv6 is not supported
  const host = parts[0] ?? "";
  const port = parts[1];
  if (host.length > MAX_HOST_LENGTH || !HOST_PATTERN.test(host)) return null;
  const labels = host.split(".");
  const last = labels[labels.length - 1] ?? "";
  // Browsers read a decimal or 0x-hex last label as an IPv4 number.
  if (/^(\d+|0x[0-9a-f]*)$/.test(last) && !isIPv4(labels)) return null;
  if (port === undefined) return host;
  if (!/^\d{1,5}$/.test(port)) return null;
  const n = Number(port);
  if (n < 1 || n > 65535) return null;
  return `${host}:${n}`;
}

export function isValidHost(input: string): boolean {
  return normaliseHost(input) !== null;
}

// The host[:port] a page reports as location.host; null for non-web URLs.
export function hostOfUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.host : null;
  } catch {
    return null;
  }
}

// Exact host[:port] match only: no subdomains, no default-port folding.
export function isAllowed(
  url: string,
  allowedSites: readonly string[],
): boolean {
  const host = hostOfUrl(url);
  return host !== null && allowedSites.includes(host);
}
