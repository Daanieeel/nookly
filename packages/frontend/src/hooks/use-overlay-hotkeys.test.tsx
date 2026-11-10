import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { useOverlayHotkeys } from "./use-overlay-hotkeys.ts";

// The dialogs these keys open load lazily, on their first opening, so the keys cannot
// live inside them: nothing would be listening until the dialog had been opened once.
function Host() {
  useOverlayHotkeys();
  return null;
}

beforeEach(() => {
  act(() => {
    useNavStore.setState({ newAssignmentOpen: false, settingsOpen: false });
  });
});

describe("useOverlayHotkeys", () => {
  it("opens the New assignment dialog with Ctrl+Shift+A", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Host />);
    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    expect(useNavStore.getState().newAssignmentOpen).toBe(true);
  });

  it("opens and closes Settings with Ctrl and a comma", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Host />);
    await user.keyboard("{Control>},{/Control}");
    expect(useNavStore.getState().settingsOpen).toBe(true);
    await user.keyboard("{Control>},{/Control}");
    expect(useNavStore.getState().settingsOpen).toBe(false);
  });
});
