import { type PlannedChange, type SyncEngine, changeKey, staysWaiting } from "./engine.ts";
import {
  MAX_PUSH_CHANGES,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type PushResult,
} from "./protocol.ts";

/// Runs sync for one device: pulls what the server has, pushes what the device
/// changed, and does it again whenever either side changes. The same on the desktop
/// and on the phone; only the engine's database and the transport differ.

export interface LiveHandlers {
  /// The live channel is up (again): anything missed is pulled.
  onOpen(): void;
  /// The server has something new.
  onChanges(): void;
  /// The account itself changed, like its email being confirmed.
  onAccount?(): void;
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

  /// What to say when a request never got an answer: the system's own error ("fetch
  /// failed", a stack location) stays as the cause, out of sight.
  static unreachable(cause: unknown): NetworkError {
    return new NetworkError("Can't reach the server. Check your connection and try again.", {
      cause,
    });
  }
}

export type SyncState = "off" | "idle" | "syncing" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  /// Local changes not on the server yet.
  pending: number;
  /// Of those, the ones the server refused: kept here and tried again later.
  held: number;
  /// Edits that lost to newer ones, kept to look at.
  conflicts: number;
  /// Changes waiting for a row they point at.
  parked: number;
  lastSyncedAt: number | null;
  error: string | null;
  /// Whether the live channel to the server is open, so other devices' changes arrive as
  /// they are made. Rounds can still go through without it; the status says so.
  live: boolean;
  /// When a round last sent changes from here or brought changes from elsewhere; a round
  /// that only checked leaves it, so "just synced" means something moved.
  lastChangedAt: number | null;
}

export interface SyncClientOptions {
  engine: SyncEngine;
  transport: SyncTransport;
  onStatus?: (status: SyncStatus) => void;
  /// Told why a sync failed, when it was not the connection.
  onFailure?: (error: Error) => void;
  /// Remote changes landed in the database; views should refresh.
  onApplied?: () => void;
  /// The server says the account itself changed (its email was confirmed).
  onAccountChanged?: () => void;
  /// Runs after every sync that reached the server, with whether remote changes
  /// landed: files, settings and the first sync's progress follow along here.
  afterCycle?: (applied: boolean) => Promise<void>;
  /// How many conflicts wait for a decision. Without it, the device's own log counts;
  /// the runtime adds the ones only the server logged.
  countConflicts?: () => Promise<number>;
  /// How long after a local change the push goes out, so a burst of typing is one push.
  debounceMs?: number;
  /// A full sync every so often, in case a live notice was missed.
  periodMs?: number;
}

/// How many rounds in a row the server may fail on the same change before it is held back.
const HOLD_AFTER = 3;
/// How long a held change waits before it is tried again. An edit to it, or the app
/// starting again, tries it at once.
const HOLD_MS = 60 * 60 * 1000;
/// The most requests one push may spend finding the change the server fails on.
const MAX_ISOLATION_REQUESTS = 40;
const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 1_000;
/// The live channel is one small connection, so it knocks again soon: the longer waits
/// are for the sync requests themselves.
const MAX_LIVE_BACKOFF_MS = 10_000;

function isNetworkError(error: Error): boolean {
  return error instanceof NetworkError || error instanceof TypeError;
}

interface PushOutcome {
  results: PushResult[];
  serverTime?: number;
  failed: { item: PlannedChange; error: Error }[];
}

/// Thrown inside a sync when the client was stopped meanwhile: what the server just
/// answered is dropped, never written.
class Stopped extends Error {}

export class SyncClient {
  private readonly engine: SyncEngine;
  private readonly transport: SyncTransport;
  private readonly onStatus?: (status: SyncStatus) => void;
  private readonly onFailure?: (error: Error) => void;
  private readonly onApplied?: () => void;
  private readonly onAccountChanged?: () => void;
  private readonly afterCycle?: (applied: boolean) => Promise<void>;
  private readonly countConflicts: () => Promise<number>;
  private readonly debounceMs: number;
  private readonly periodMs: number;
  private running: Promise<void> | null = null;
  private again = false;
  private started = false;
  private closeLive: (() => void) | null = null;
  private liveAttempts = 0;
  private failures = 0;
  /// Rounds in a row the server failed on a change, by `changeKey`.
  private readonly stuck = new Map<string, number>();
  /// Changes the server refused, by `changeKey`: the version refused and when to try
  /// again. Only kept in memory: the rows themselves stay marked as waiting.
  private readonly held = new Map<string, { version: number; until: number }>();
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private period: ReturnType<typeof setInterval> | null = null;
  private status: SyncStatus = {
    state: "off",
    pending: 0,
    held: 0,
    conflicts: 0,
    parked: 0,
    lastSyncedAt: null,
    error: null,
    live: false,
    lastChangedAt: null,
  };

  constructor(options: SyncClientOptions) {
    this.engine = options.engine;
    this.transport = options.transport;
    this.onStatus = options.onStatus;
    this.onFailure = options.onFailure;
    this.onApplied = options.onApplied;
    this.onAccountChanged = options.onAccountChanged;
    this.afterCycle = options.afterCycle;
    this.countConflicts =
      options.countConflicts ?? (async () => (await this.engine.conflicts()).length);
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

  /// The changes held back, by `changeKey`.
  heldKeys(): ReadonlySet<string> {
    return new Set(this.held.keys());
  }

  /// Turns sync on for this device and keeps it running.
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.engine.enable();
    // Best effort: when it fails now, the next start does it.
    await this.engine.requeueSetAside().catch(() => {});
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

  /// The device is back: the app came to the front, the computer woke or the network
  /// returned. Syncs now and opens the live channel if it is down, instead of sitting out a
  /// retry drawn during the outage. Safe to call as often as wanted.
  resume() {
    if (!this.started) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.failures = 0;
    if (!this.closeLive) {
      if (this.reconnect) clearTimeout(this.reconnect);
      this.reconnect = null;
      this.liveAttempts = 0;
      this.openLive();
    }
    void this.syncNow();
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
      const sent = await this.pushAll();
      applied = (await this.pullAll()) || applied;
      this.failures = 0;
      const conflicts = await this.countConflicts();
      const at = Date.now();
      this.report({
        state: "idle",
        pending: await this.engine.pendingCount(),
        held: await this.countHeld(),
        conflicts,
        lastSyncedAt: at,
        ...((applied || sent) && { lastChangedAt: at }),
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
      if (!isNetworkError(error)) this.onFailure?.(error);
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

  /// Sends everything waiting; whether anything went.
  private async pushAll(): Promise<boolean> {
    let sent = false;
    let serverTime: number | undefined;
    for (let round = 0; round < 1_000; round++) {
      const planned = await this.engine.collect(MAX_PUSH_CHANGES, {
        held: this.heldNow(),
        serverTime,
      });
      if (planned.length === 0) return sent;
      const outcome = await this.pushIsolating(planned, { requests: 0 });
      this.assertStarted();
      await this.engine.acknowledge(planned, outcome.results);
      const results = new Map(outcome.results.map((r) => [changeKey(r.table, r.pk), r]));
      // The first refused clock of a push is dated by the server's time and sent again
      // right away; a server that doesn't tell its time leaves this device's own.
      const redate = serverTime === undefined;
      for (const item of planned) {
        const key = changeKey(item.change.table, item.change.pk);
        const result = results.get(key);
        if (!result) continue;
        if (result.status === "applied") {
          sent = true;
          this.held.delete(key);
          this.stuck.delete(key);
        } else if (!staysWaiting(result)) {
          sent = true;
          this.held.delete(key);
        } else if (result.reason === "clock-skew" && redate) {
          serverTime = outcome.serverTime ?? Date.now();
        } else this.hold(item);
      }
      // The server fails on these alone. A few rounds in a row and they are held back, so
      // one row can't hold up everything behind it.
      let retry: Error | null = null;
      for (const { item, error } of outcome.failed) {
        const key = changeKey(item.change.table, item.change.pk);
        const times = (this.stuck.get(key) ?? 0) + 1;
        this.stuck.set(key, times);
        if (times >= HOLD_AFTER || this.held.has(key)) {
          this.stuck.delete(key);
          this.hold(item);
        } else retry ??= error;
      }
      this.report({
        pending: await this.engine.pendingCount(),
        held: await this.countHeld(),
      });
      if (retry) throw retry;
    }
    return sent;
  }

  private hold(item: PlannedChange) {
    this.held.set(changeKey(item.change.table, item.change.pk), {
      version: item.version,
      until: Date.now() + HOLD_MS,
    });
  }

  /// The held changes still waiting for their next try.
  private heldNow(): Map<string, number> {
    const now = Date.now();
    return new Map(
      [...this.held].filter(([, h]) => h.until > now).map(([key, h]) => [key, h.version]),
    );
  }

  /// How many changes are held back. One that no longer waits (a newer edit from another
  /// device replaced it) is forgotten.
  private async countHeld(): Promise<number> {
    if (this.held.size === 0) return 0;
    const versions = new Map([...this.held].map(([key, h]) => [key, h.version]));
    const waiting = await this.engine.stillWaiting(versions);
    for (const key of this.held.keys()) if (!waiting.has(key)) this.held.delete(key);
    return this.held.size;
  }

  /// Pushes `planned`. When the server answers 500 for the whole push, the halves go one
  /// after the other, down to the single change it fails on; the rest is taken. Only a
  /// 500 is split: an outage (502, 503) or a bad token fails the same for every change.
  private async pushIsolating(
    planned: PlannedChange[],
    budget: { requests: number },
  ): Promise<PushOutcome> {
    try {
      budget.requests++;
      const response = await this.transport.push({ changes: planned.map((p) => p.change) });
      return { results: response.results, serverTime: response.serverTime, failed: [] };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      // An `ApiRequestError` carries the HTTP status; this file can't import it.
      const serverFailed = "status" in error && error.status === 500;
      if (!serverFailed || budget.requests >= MAX_ISOLATION_REQUESTS) throw error;
      const [only] = planned;
      if (only && planned.length === 1) return { results: [], failed: [{ item: only, error }] };
      this.assertStarted();
      const middle = Math.ceil(planned.length / 2);
      const first = await this.pushIsolating(planned.slice(0, middle), budget);
      const second = await this.pushIsolating(planned.slice(middle), budget);
      return {
        results: [...first.results, ...second.results],
        serverTime: second.serverTime ?? first.serverTime,
        failed: [...first.failed, ...second.failed],
      };
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
        this.report({ live: true });
        void this.syncNow();
      },
      onChanges: () => void this.syncNow(),
      onAccount: () => this.onAccountChanged?.(),
      onClose: () => {
        this.closeLive = null;
        if (!this.started) return;
        this.report({ live: false, ...(this.status.state === "idle" && { state: "offline" }) });
        const delay = this.backoff(this.liveAttempts++, MAX_LIVE_BACKOFF_MS);
        this.reconnect = setTimeout(() => {
          this.reconnect = null;
          this.openLive();
        }, delay);
      },
    });
  }
}
