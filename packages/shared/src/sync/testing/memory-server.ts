import { mergeRecords, EMPTY_RECORD } from "../record.ts";
import {
  changeRejection,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncRecord,
} from "../protocol.ts";

/// The server's sync semantics in memory, for tests of the engine and the client:
/// one account, its own dataset only. `apps/server` implements the same on Postgres.
export class MemoryServer {
  private seq = 0;
  readonly records = new Map<string, SyncRecord>();

  /// The server's own time; a test moves it to be a device whose clock is wrong.
  now: () => number = Date.now;
  /// The changes this server can't store, for a test of a device that holds one.
  refuses: (change: PushRequest["changes"][number]) => boolean = () => false;

  push(request: PushRequest): PushResponse {
    const now = this.now();
    let skewed = false;
    const response: PushResponse = {
      results: request.changes.map((change) => {
        const reason = this.refuses(change) ? "invalid-value" : changeRejection(change, now);
        if (reason) {
          skewed ||= reason === "clock-skew";
          return {
            dataset: change.dataset,
            table: change.table,
            pk: change.pk,
            status: "rejected" as const,
            reason,
          };
        }
        const key = `${change.table}\u0000${change.pk}`;
        const stored = this.records.get(key) ?? {
          ...EMPTY_RECORD,
          table: change.table,
          pk: change.pk,
          scope: null,
          seq: 0,
        };
        const merged = mergeRecords(stored, change);
        this.records.set(key, {
          ...merged,
          table: change.table,
          pk: change.pk,
          scope: change.scope ?? stored.scope,
          seq: ++this.seq,
        });
        return {
          dataset: change.dataset,
          table: change.table,
          pk: change.pk,
          status: "applied" as const,
        };
      }),
    };
    return skewed ? { ...response, serverTime: now } : response;
  }

  pull(request: PullRequest): PullResponse {
    const cursor = request.cursors.own ?? 0;
    const limit = request.limit ?? 1000;
    const newer = [...this.records.values()]
      .filter((r) => r.seq > cursor)
      .sort((a, b) => a.seq - b.seq);
    const records = newer.slice(0, limit);
    return {
      datasets: [
        {
          dataset: "own",
          role: "owner",
          records,
          cursor: records.at(-1)?.seq ?? cursor,
          hasMore: newer.length > limit,
        },
      ],
      removed: [],
    };
  }
}
