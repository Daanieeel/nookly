import type { SyncEngine } from "./engine.ts";
import type { PullRequest, PullResponse, PushRequest, PushResponse } from "./protocol.ts";

/// Runs sync for one device: pulls what the server has, pushes what the device
/// changed, and does it again whenever either side changes. The same on the desktop
/// and on the phone; only the engine's database and the transport differ.

export interface LiveHandlers {
  /// The live channel is up (again): anything missed is pulled.
  onOpen(): void;
  /// The server has something new.
  onChanges(): void;
  onClose(): void;
}

export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
  /// Opens the live channel and returns its close function.
  live?(handlers: LiveHandlers): () => void;
}

/// The server can't be reached at all (offline, wrong address).
export class NetworkError extends Error {
  override readonly name = "NetworkError";
}

export type SyncState = "off" | "idle" | "syncing" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  /// Local changes not on the server yet.
  pending: number;
  /// Edits that lost to newer ones, kept to look at.
  conflicts: number;
  /// Changes waiting for a row they point at.
  parked: number;
  lastSyncedAt: number | null;
  error: string | null;
}

export interface SyncClientOptions {
  engine: SyncEngine;
  transport: SyncTransport;
  onStatus?: (status: SyncStatus) => void;
  /// Remote changes landed in the database; views should refresh.
  onApplied?: () => void;
  /// Runs after every sync that reached the server, with whether remote changes
  /// landed: files, settings and the first sync's progress follow along here.
  afterCycle?: (applied: boolean) => Promise<void>;
  /// How long after a local change the push goes out, so a burst of typing is one push.
  debounceMs?: number;
  /// A full sync every so often, in case a live notice was missed.
  periodMs?: number;
}

const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 1_000;
/// The live channel is one small connection, so it knocks again soon: the longer waits
/// are for the sync requests themselves.
const MAX_LIVE_BACKOFF_MS = 10_000;

function isNetworkError(error: Error): boolean {
  return error instanceof NetworkError || error instanceof TypeError;
}

/// Thrown inside a sync when the client was stopped meanwhile: what the server just
/// answered is dropped, never written.
class Stopped extends Error {}

export class SyncClient {
  private readonly engine: SyncEngine;
  private readonly transport: SyncTransport;
  private readonly onStatus?: (status: SyncStatus) => void;
  private readonly onApplied?: () => void;
  private readonly afterCycle?: (applied: boolean) => Promise<void>;
  private readonly debounceMs: number;
  private readonly periodMs: number;
  private running: Promise<void> | null = null;
  private again = false;
  private started = false;
  private closeLive: (() => void) | null = null;
  private liveAttempts = 0;
  private failures = 0;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private period: ReturnType<typeof setInterval> | null = null;
  private status: SyncStatus = {
    state: "off",
    pending: 0,
    conflicts: 0,
    parked: 0,
    lastSyncedAt: null,
    error: null,
  };

  constructor(options: SyncClientOptions) {
    this.engine = options.engine;
    this.transport = options.transport;
    this.onStatus = options.onStatus;
    this.onApplied = options.onApplied;
    this.afterCycle = options.afterCycle;
    this.debounceMs = options.debounceMs ?? 400;
    this.periodMs = options.periodMs ?? 60_000;
  }

  current(): SyncStatus {
    return this.status;
  }

  private report(change: Partial<SyncStatus>) {
    this.status = { ...this.status, ...change };
    this.onStatus?.(this.status);
  }

  /// Turns sync on for this device and keeps it running.
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.engine.enable();
    this.openLive();
    this.period = setInterval(() => void this.syncNow(), this.periodMs);
    await this.syncNow();
  }

  stop() {
    this.started = false;
    for (const timer of [this.debounce, this.retry, this.reconnect]) if (timer) clearTimeout(timer);
    if (this.period) clearInterval(this.period);
    this.debounce = this.retry = this.reconnect = this.period = null;
    this.closeLive?.();
    this.closeLive = null;
    this.report({ state: "off" });
  }

  /// Resolves once the sync in flight, if any, has ended. After `stop()` that sync
  /// writes nothing, so what follows (a sign out wiping sync state) is safe.
  async finished(): Promise<void> {
    await this.running?.catch(() => {});
  }

  /// Something changed locally; what is waiting goes out shortly. A change with nothing
  /// to send (text typed in a live page is kept as rows that are not edits) starts no
  /// round trip: what others change reaches this device over the live channel.
  notifyLocalChange() {
    if (!this.started) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.engine
        .pendingCount()
        .catch(() => 1)
        .then((pending) => (pending > 0 ? this.syncNow() : undefined));
    }, this.debounceMs);
  }

  /// Syncs now. While a sync runs, a call makes it go round once more and waits for that.
  syncNow(): Promise<void> {
    if (!this.started) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.cycle();
        } while (this.again && this.started);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async cycle() {
    this.report({ state: "syncing", error: null });
    try {
      let applied = await this.pullAll();
      await this.pushAll();
      applied = (await this.pullAll()) || applied;
      this.failures = 0;
      const conflicts = (await this.engine.conflicts()).length;
      this.report({
        state: "idle",
        pending: await this.engine.pendingCount(),
        conflicts,
        lastSyncedAt: Date.now(),
      });
      if (applied) this.onApplied?.();
      await this.afterCycle?.(applied);
    } catch (cause) {
      if (cause instanceof Stopped) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.report({
        state: isNetworkError(error) ? "offline" : "error",
        error: isNetworkError(error) ? null : error.message,
        pending: await this.engine.pendingCount().catch(() => this.status.pending),
      });
      this.scheduleRetry();
    }
  }

  private assertStarted() {
    if (!this.started) throw new Stopped();
  }

  /// Pulls every dataset until the server has nothing more. Whether anything changed.
  private async pullAll(): Promise<boolean> {
    let changed = false;
    for (let page = 0; page < 1_000; page++) {
      const response = await this.transport.pull({ cursors: await this.engine.cursors() });
      this.assertStarted();
      for (const dataset of response.removed) {
        await this.engine.forget(dataset);
        changed = true;
      }
      const summary = await this.engine.apply(response.datasets);
      if (summary.applied > 0 || response.datasets.some((d) => d.records.length > 0))
        changed = true;
      this.report({ parked: summary.parked });
      if (!response.datasets.some((d) => d.hasMore)) break;
    }
    return changed;
  }

  private async pushAll() {
    for (let round = 0; round < 1_000; round++) {
      const planned = await this.engine.collect();
      if (planned.length === 0) return;
      const response = await this.transport.push({ changes: planned.map((p) => p.change) });
      this.assertStarted();
      await this.engine.acknowledge(planned, response.results);
      this.report({ pending: await this.engine.pendingCount() });
    }
  }

  /// Waits longer after each failure, up to a minute, with some spread so a server
  /// coming back isn't hit by every device at once.
  private backoff(attempt: number, max = MAX_BACKOFF_MS): number {
    const exponential = Math.min(max, BASE_BACKOFF_MS * 2 ** attempt);
    return exponential / 2 + Math.random() * (exponential / 2);
  }

  private scheduleRetry() {
    if (!this.started || this.retry) return;
    const delay = this.backoff(this.failures++);
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.syncNow();
    }, delay);
  }

  private openLive() {
    if (!this.started || !this.transport.live) return;
    this.closeLive = this.transport.live({
      onOpen: () => {
        this.liveAttempts = 0;
        void this.syncNow();
      },
      onChanges: () => void this.syncNow(),
      onClose: () => {
        this.closeLive = null;
        if (!this.started) return;
        if (this.status.state === "idle") this.report({ state: "offline" });
        const delay = this.backoff(this.liveAttempts++, MAX_LIVE_BACKOFF_MS);
        this.reconnect = setTimeout(() => {
          this.reconnect = null;
          this.openLive();
        }, delay);
      },
    });
  }
}
