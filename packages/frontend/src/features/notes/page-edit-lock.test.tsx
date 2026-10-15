import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TabGroupContext } from "#/components/tab-group-scope.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { usePageEditLock } from "./page-edit-lock.ts";

const initial = useNavStore.getState();

beforeEach(() => {
  useNavStore.setState(initial, true);
});

function lockIn(groupId: string, entityId = "page") {
  const focused = () => useNavStore.getState().focusedGroupId === groupId;
  return renderHook(() => usePageEditLock(entityId), {
    wrapper: ({ children }) => (
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
