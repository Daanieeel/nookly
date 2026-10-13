/// Passwords are hashed with argon2id at OWASP's recommended cost.
const OPTIONS = { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 } as const;

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, OPTIONS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash).catch(() => false);
}

/// Checked against when an email has no account, so a wrong email takes as long as
/// a wrong password and doesn't reveal which accounts exist.
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("not a real password, only for timing");
  return dummy;
}
