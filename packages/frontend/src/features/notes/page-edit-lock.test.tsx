import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { beforeEach, describe, expect, it } from "vitest";
import { TabGroupContext } from "#/components/tab-group-scope.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { usePageEditLock } from "./page-edit-lock.ts";

const initial = useNavStore.getState();

beforeEach(() => {
  useNavStore.setState(initial, true);
});

const queryClient = new QueryClient();

function lockIn(groupId: string, entityId = "page") {
  const focused = () => useNavStore.getState().focusedGroupId === groupId;
  return renderHook(() => usePageEditLock(entityId), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <TabGroupContext.Provider
          value={{
            groupId,
            tabId: `tab-${groupId}`,
            view: { kind: "dashboard" },
            focused: focused(),
          }}
        >
          {children}
        </TabGroupContext.Provider>
      </QueryClientProvider>
    ),
  });
}

describe("the same page open in both groups", () => {
  it("never locks a page open once", () => {
    useNavStore.setState({ focusedGroupId: "R" });
    const left = lockIn("L");
    expect(left.result.current).toBe(false);
  });

  it("lets only the focused group's editor write", () => {
    useNavStore.setState({ focusedGroupId: "R" });
    const left = lockIn("L");
    const right = lockIn("R");
    expect(left.result.current).toBe(true);
    expect(right.result.current).toBe(false);
    act(() => useNavStore.setState({ focusedGroupId: "L" }));
    expect(left.result.current).toBe(false);
    expect(right.result.current).toBe(true);
  });

  it("unlocks once the other editor closes", () => {
    useNavStore.setState({ focusedGroupId: "R" });
    const left = lockIn("L");
    const right = lockIn("R");
    expect(left.result.current).toBe(true);
    right.unmount();
    expect(left.result.current).toBe(false);
  });

  it("leaves other pages alone", () => {
    useNavStore.setState({ focusedGroupId: "R" });
    const left = lockIn("L", "a");
    lockIn("R", "b");
    expect(left.result.current).toBe(false);
  });
});

describe("a page someone shared to view only", () => {
  it("stays read only, so no edit is typed only to be undone", async () => {
    mockCommand("sync_query", [{ role: "viewer" }]);
    const { result } = renderHook(() => usePageEditLock("page", "shared-owner"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays editable for an editor", async () => {
    mockCommand("sync_query", [{ role: "editor" }]);
    const { result } = renderHook(() => usePageEditLock("page", "shared-owner"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(callsOf("sync_query").length).toBeGreaterThan(0));
    expect(result.current).toBe(false);
  });
});
