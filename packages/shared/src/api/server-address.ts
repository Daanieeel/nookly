/// Nookly's own sync server, which a released app offers first.
export const PRODUCTION_SERVER = "https://sync.nookly.work";

/// The server an app offers before it is told another: Nookly's own in a released build,
/// the one `bun run stack` runs on this machine in development (which Android's emulator
/// reaches at its own address).
export function defaultServer({ dev, android = false }: { dev: boolean; android?: boolean }) {
  if (!dev) return PRODUCTION_SERVER;
  return android ? "http://10.0.2.2:3000" : "http://localhost:3000";
}

/// Nookly's own server is a closed beta: creating an account there needs the beta key. A
/// server someone runs themselves decides for itself and answers when it wants a key.
export function asksForBetaKey(serverUrl: string) {
  return serverUrl.trim().replace(/\/+$/, "").toLowerCase() === PRODUCTION_SERVER;
}

export const BETA_KEY_MISSING = "Enter the beta key to create an account.";
