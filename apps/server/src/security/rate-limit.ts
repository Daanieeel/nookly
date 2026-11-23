interface Hits {
  count: number;
  resetAt: number;
}

/// Fixed window rate limits, in memory: the server runs as one process on one machine.
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits = new Map<string, Hits>();

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = Math.max(1, Math.round(limit));
    this.windowMs = windowMs;
    this.now = now;
  }

  /// Counts one hit for `key`. Null when allowed, else the seconds to wait.
  take(key: string): number | null {
    const entry = this.count(key);
    return entry.count > this.limit ? this.waitFor(entry) : null;
  }

  /// For what is only limited once it goes wrong (a wrong password): `blocked` asks, and
  /// `record` counts a failure. The seconds to wait once the failures have used up the
  /// allowance, else null.
  blocked(key: string): number | null {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= this.now()) return null;
    return entry.count >= this.limit ? this.waitFor(entry) : null;
  }

  record(key: string): void {
    this.count(key);
  }

  private count(key: string): Hits {
    const now = this.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + this.windowMs };
      this.hits.set(key, fresh);
      return fresh;
    }
    entry.count++;
    return entry;
  }

  private waitFor(entry: Hits): number {
    return Math.ceil((entry.resetAt - this.now()) / 1000);
  }
}
