import { mergeRecords, EMPTY_RECORD } from "../record.ts";
import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncRecord,
} from "../protocol.ts";

/// The server's sync semantics in memory, for tests of the engine and the client:
/// one account, its own dataset only. `apps/server` implements the same on Postgres.
export class MemoryServer {
  private seq = 0;
  readonly records = new Map<string, SyncRecord>();

  push(request: PushRequest): PushResponse {
    return {
      results: request.changes.map((change) => {
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
