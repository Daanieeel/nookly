import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeEntity, makeSession } from "#/test/fixtures.ts";
import {
  callsOf,
  installTauriMock,
  mockCommand,
  mockCommandWith,
  uninstallTauriMock,
} from "#/test/tauri.ts";
import { useJotCapture } from "./QuickJot.tsx";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const session = makeSession({ courseTitle: "Physics", date: "2026-03-10" });

beforeEach(() => {
  installTauriMock();
  mockCommand("soft_delete_entity", null);
});
afterEach(uninstallTauriMock);

function capture(text: string) {
  const { result } = renderHook(
    () => useJotCapture({ spaceId: "space-1", session, onSaved: () => {} }),
    { wrapper },
  );
  act(() => result.current.setText(text));
  act(() => {
    result.current.submit();
  });
  return result;
}

describe("useJotCapture for a session", () => {
  it("never deletes a session jot that existed before when writing blocks fails", async () => {
    mockCommand("get_session_pages", {
      jot: makeEntity({ id: "jot-old", type: "jot" }),
      note: null,
    });
    mockCommandWith("create_block", () => {
      throw new Error("disk full");
    });
    const result = capture("hello");
    await waitFor(() => expect(result.current.save.isError).toBe(true));
    expect(callsOf("soft_delete_entity")).toHaveLength(0);
  });

  it("appends to the existing jot instead of creating another", async () => {
    mockCommand("get_session_pages", {
      jot: makeEntity({ id: "jot-old", type: "jot" }),
      note: null,
    });
    mockCommand("create_block", {});
    const result = capture("hello");
    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    expect(callsOf("create_session_page")).toHaveLength(0);
    expect(callsOf("create_block")[0]).toMatchObject({ entityId: "jot-old" });
  });

  it("creates the session jot when none exists and rolls back only that one", async () => {
    mockCommand("get_session_pages", { jot: null, note: null });
    mockCommand("create_session_page", makeEntity({ id: "jot-new", type: "jot" }));
    mockCommandWith("create_block", () => {
      throw new Error("disk full");
    });
    const result = capture("hello");
    await waitFor(() => expect(result.current.save.isError).toBe(true));
    expect(callsOf("soft_delete_entity")).toEqual([{ id: "jot-new" }]);
    expect(callsOf("create_session_page")[0]).toMatchObject({
      sessionId: "session-1",
      kind: "jot",
    });
  });
});
