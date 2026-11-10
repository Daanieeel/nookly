import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { OnFirstOpen } from "./on-first-open.tsx";

let parentRenders = 0;

function Parent() {
  parentRenders += 1;
  return (
    <OnFirstOpen isOpen={(s) => s.settingsOpen}>
      <p>dialog code</p>
    </OnFirstOpen>
  );
}

beforeEach(() => {
  act(() => useNavStore.getState().setSettingsOpen(false));
  parentRenders = 0;
});

describe("OnFirstOpen", () => {
  it("mounts its children on the first open and keeps them after closing", () => {
    render(<Parent />);
    expect(screen.queryByText("dialog code")).toBeNull();
    act(() => useNavStore.getState().setSettingsOpen(true));
    expect(screen.getByText("dialog code")).toBeInTheDocument();
    act(() => useNavStore.getState().setSettingsOpen(false));
    expect(screen.getByText("dialog code")).toBeInTheDocument();
  });

  it("opening and closing does not re-render the app around it", () => {
    render(<Parent />);
    const before = parentRenders;
    act(() => useNavStore.getState().setSettingsOpen(true));
    act(() => useNavStore.getState().setSettingsOpen(false));
    expect(parentRenders).toBe(before);
  });
});
