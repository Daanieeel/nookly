/// The address a request came from, as far as it can be trusted.
///
/// Behind a reverse proxy the connection is the proxy's, and the client's address is in
/// `X-Forwarded-For`. A client can send that header too, and each proxy appends the
/// address it saw to the end, so only the entries the proxies wrote count: the one
/// `hops` proxies from the right. Anything before them is the client's own claim.
export function clientIp(
  forwarded: string | null | undefined,
  remote: string | undefined,
  trustProxy: boolean,
  hops = 1,
): string {
  if (trustProxy && forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const seen = entries[entries.length - hops];
    if (seen) return seen;
  }
  return remote || "unknown";
}
