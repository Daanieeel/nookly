import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "#/lib/query-keys.ts";
import { useExternalDbChanges } from "./use-external-db-changes.ts";

const EVENT = "db:external-change";

function setup() {
  const client = new QueryClient();
  const databaseFetch = vi.fn(() => Promise.resolve("rows"));
  const appFetch = vi.fn(() => Promise.resolve("1.0.0"));
  // Both queries are on screen: an observer keeps each one active.
  client.getQueryCache().build(client, { queryKey: qk.spaces, queryFn: databaseFetch });
  const observers = [
    client.getQueryCache().build(client, { queryKey: qk.spaces, queryFn: databaseFetch }),
    client.getQueryCache().build(client, { queryKey: qk.appVersion, queryFn: appFetch }),
  ];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, databaseFetch, appFetch, observers, wrapper };
}

describe("useExternalDbChanges", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes once for a burst of writes, and leaves queries that do not read the database", async () => {
    const { client, wrapper } = setup();
    const refreshed: string[] = [];
    client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "invalidate") {
        refreshed.push(String(event.query.queryKey[0]));
      }
    });
    client.setQueryData(qk.spaces, []);
    client.setQueryData(qk.appVersion, "1.0.0");
    renderHook(() => useExternalDbChanges(), { wrapper });
    await vi.advanceTimersByTimeAsync(10);

    await emit(EVENT);
    await emit(EVENT);
    await emit(EVENT);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(refreshed).toEqual(["spaces"]);
  });

  it("does nothing until the writes stop", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(qk.spaces, []);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useExternalDbChanges(), { wrapper });
    await vi.advanceTimersByTimeAsync(10);

    await emit(EVENT);
    await vi.advanceTimersByTimeAsync(50);
    expect(invalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
