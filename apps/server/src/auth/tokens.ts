import { SignJWT, jwtVerify } from "jose";

/// A random token for refresh, email and invite links: 32 bytes, URL safe.
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

/// Tokens are stored only as their SHA-256, so a leaked database holds no usable token.
export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export class AccessTokens {
  private readonly key: Uint8Array;
  private readonly ttlSeconds: number;

  constructor(secret: string, ttlSeconds: number) {
    this.key = new TextEncoder().encode(secret);
    this.ttlSeconds = ttlSeconds;
  }

  get ttl() {
    return this.ttlSeconds;
  }

  sign(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .setAudience("nookly")
      .sign(this.key);
  }

  /// The claims of a valid, unexpired token, else null.
  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        audience: "nookly",
        algorithms: ["HS256"],
      });
      const sessionId = payload.sid;
      if (!payload.sub || !sessionId || !String(sessionId)) return null;
      return { userId: payload.sub, sessionId: String(sessionId) };
    } catch {
      return null;
    }
  }
}
