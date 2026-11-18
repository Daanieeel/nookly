/// A random token for invite links: 32 bytes, URL safe.
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

/// Tokens are stored only as their SHA-256, so a leaked database holds no usable token.
export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}
