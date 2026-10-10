import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { mockCommand } from "#/test/tauri.ts";
import { useUpdatedNotice } from "./updated-notice.ts";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function run(running: string) {
  mockCommand("plugin:app|version", running);
  return renderHook(() => useUpdatedNotice(), { wrapper });
}

beforeEach(() => {
  preferences.remove(STORAGE_KEYS.lastSeenVersion);
  preferences.remove(STORAGE_KEYS.whatsNewSince);
});

describe("useUpdatedNotice", () => {
  it("says nothing on the first run, and remembers the version", async () => {
    const { result } = run("0.31.10");
    await waitFor(() => expect(preferences.get(STORAGE_KEYS.lastSeenVersion)).toBe("0.31.10"));
    expect(result.current.version).toBeNull();
  });

  it("announces a newer version than the one last seen", async () => {
    preferences.set(STORAGE_KEYS.lastSeenVersion, "0.30.2");
    const { result } = run("0.31.10");
    await waitFor(() => expect(result.current.version).toBe("0.31.10"));
    // Seen only once the user has dealt with the card, not just by starting the app.
    expect(preferences.get(STORAGE_KEYS.lastSeenVersion)).toBe("0.30.2");
  });

  it("stops announcing it once dismissed, and stays quiet on the next start", async () => {
    preferences.set(STORAGE_KEYS.lastSeenVersion, "0.30.2");
    const { result } = run("0.31.10");
    await waitFor(() => expect(result.current.version).toBe("0.31.10"));
    act(() => result.current.dismiss());
    expect(result.current.version).toBeNull();
    expect(preferences.get(STORAGE_KEYS.lastSeenVersion)).toBe("0.31.10");
    const again = run("0.31.10");
    await waitFor(() => expect(again.result.current.version).toBeNull());
  });

  it("says nothing when the same version is running", async () => {
    preferences.set(STORAGE_KEYS.lastSeenVersion, "0.31.10");
    const { result } = run("0.31.10");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(result.current.version).toBeNull();
  });

  it("says nothing after a move to an older version, and remembers that one", async () => {
    preferences.set(STORAGE_KEYS.lastSeenVersion, "0.31.10");
    const { result } = run("0.30.2");
    await waitFor(() => expect(preferences.get(STORAGE_KEYS.lastSeenVersion)).toBe("0.30.2"));
    expect(result.current.version).toBeNull();
  });

  it("remembers the version it updated from, for the what's new dialog to read", async () => {
    preferences.set(STORAGE_KEYS.lastSeenVersion, "0.30.2");
    const { result } = run("0.32.0");
    await waitFor(() => expect(result.current.version).toBe("0.32.0"));
    expect(preferences.get(STORAGE_KEYS.whatsNewSince)).toBe("0.30.2");
    // Dismissing the card does not forget it: the dialog can still be opened from Settings.
    act(() => result.current.dismiss());
    expect(preferences.get(STORAGE_KEYS.whatsNewSince)).toBe("0.30.2");
  });

  it("keeps the oldest version it has not told about across several updates", async () => {
    preferences.set(STORAGE_KEYS.lastSeenVersion, "0.30.2");
    run("0.31.10");
    await waitFor(() => expect(preferences.get(STORAGE_KEYS.whatsNewSince)).toBe("0.30.2"));
    // Updated again before the card was ever used: still counted from what was last seen.
    run("0.32.0");
    await waitFor(() => expect(preferences.get(STORAGE_KEYS.whatsNewSince)).toBe("0.30.2"));
  });

  it("starts over after the user has seen a version and updates again", async () => {
    preferences.set(STORAGE_KEYS.lastSeenVersion, "0.31.10");
    const { result } = run("0.32.0");
    await waitFor(() => expect(result.current.version).toBe("0.32.0"));
    expect(preferences.get(STORAGE_KEYS.whatsNewSince)).toBe("0.31.10");
  });

  it("writes nothing on a first run or when the version has not changed", async () => {
    run("0.32.0");
    await waitFor(() => expect(preferences.get(STORAGE_KEYS.lastSeenVersion)).toBe("0.32.0"));
    expect(preferences.get(STORAGE_KEYS.whatsNewSince)).toBeNull();
  });
});
