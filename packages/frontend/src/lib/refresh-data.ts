import type { QueryClient } from "@tanstack/react-query";
import { qk } from "#/lib/query-keys.ts";

/// Queries that never read the database. A change to the data cannot make them stale, so a
/// refresh leaves them alone instead of fetching them again.
const NOT_DATABASE_DATA: ReadonlySet<string> = new Set([
  qk.crashReport[0],
  qk.aiApps[0],
  qk.appVersion[0],
  qk.appUpdate[0],
  qk.cliInstallStatus[0],
  qk.backups.root[0],
  qk.agentFiles.dir[0],
  qk.externalCalendars.status[0],
  qk.localFile("")[0],
  qk.spellSuggestions("")[0],
  qk.highlight(null, "")[0],
]);

/// Marks every query that reads the database as stale and fetches again the ones on screen.
/// For a change that can touch anything (another process wrote, a module and its content
/// were removed); a change with a known reach should invalidate just its own keys instead.
export function refreshDatabaseData(client: QueryClient): Promise<void> {
  return client.invalidateQueries({
    refetchType: "active",
    predicate: (query) => !NOT_DATABASE_DATA.has(String(query.queryKey[0])),
  });
}
