import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { logger } from "#/lib/log.ts";

/// The first part of a key names the data ("tasks"); the rest can hold what someone
/// searched for or typed, so only the name is logged.
function keyName(key: readonly unknown[] | undefined, fallback: string): string {
  const first = z.string().safeParse(key?.[0]);
  return first.success ? first.data : fallback;
}

/// The app's query client. Every failed query and mutation is logged in one place, so a
/// failure no screen handles still leaves a line in the log.
export function createQueryClient(): QueryClient {
  return new QueryClient({
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
}
