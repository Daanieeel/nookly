/// Fixed window rate limits, in memory: the server runs as one process on one machine.
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = Math.max(1, Math.round(limit));
    this.windowMs = windowMs;
    this.now = now;
  }

  /// Counts one hit for `key`. Null when allowed, else the seconds to wait.
  take(key: string): number | null {
    const now = this.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return null;
    }
    entry.count++;
    return entry.count > this.limit ? Math.ceil((entry.resetAt - now) / 1000) : null;
  }
}
