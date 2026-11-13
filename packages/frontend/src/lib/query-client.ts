import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { logger } from "#/lib/log.ts";
import { qk } from "#/lib/query-keys.ts";

/// The first part of a key names the data ("tasks"); the rest can hold what someone
/// searched for or typed, so only the name is logged.
function keyName(key: readonly unknown[] | undefined, fallback: string): string {
  const first = z.string().safeParse(key?.[0]);
  return first.success ? first.data : fallback;
}

/// Queries about things outside the database that can change while Nookly is in the
/// background: files on disk, the system, the network. They refetch when the window comes
/// back. Everything else reads the database, which tells the app itself when another process
/// wrote to it, so refetching on every focus would only repeat finished work.
const REFETCH_ON_FOCUS: readonly (readonly string[])[] = [
  qk.agentFiles.dir.slice(0, 1),
  qk.localFile("").slice(0, 1),
  qk.backups.root,
  qk.externalCalendars.status.slice(0, 1),
  qk.cliInstallStatus,
  qk.aiApps,
  qk.appUpdate,
];

/// The app's query client. Every failed query and mutation is logged in one place, so a
/// failure no screen handles still leaves a line in the log.
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, networkMode: "always" },
      mutations: { networkMode: "always" },
    },
    queryCache: new QueryCache({
      onError: (error, query) =>
        logger.error("query", `Loading ${keyName(query.queryKey, "data")} failed`, error),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        logger.warn(
          "mutation",
          `Saving ${keyName(mutation.options.mutationKey, "a change")} failed`,
          error,
        ),
    }),
  });
  for (const key of REFETCH_ON_FOCUS) {
    client.setQueryDefaults(key, { refetchOnWindowFocus: true });
  }
  return client;
}
