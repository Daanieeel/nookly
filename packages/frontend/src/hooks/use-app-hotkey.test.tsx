import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { useAppHotkey, useScreenHotkeys } from "./use-app-hotkey.ts";
import { useCreateShortcut } from "./use-create-shortcut.ts";

afterEach(() => {
  act(() => {
    settings.apply([
      { id: "shortcuts.search", reset: true },
      { id: "shortcuts.today", reset: true },
      { id: "shortcuts.create", reset: true },
      { id: "shortcuts.newItem", reset: true },
      { id: "shortcuts.quickJot", reset: true },
    ]);
  });
});

function Search({ onFire }: { onFire: () => void }) {
  useAppHotkey("search", onFire);
  return null;
}

describe("rebinding a shortcut", () => {
  it("fires on the default key until it is changed", async () => {
    const user = userEvent.setup({ delay: null });
    const onFire = vi.fn();
    render(<Search onFire={onFire} />);
    await user.keyboard("{Control>}k{/Control}");
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("applies live: the new key fires and the old one does not", async () => {
    const user = userEvent.setup({ delay: null });
    const onFire = vi.fn();
    render(<Search onFire={onFire} />);
    act(() => settings.set("shortcuts.search", "Mod+Shift+K"));
    await user.keyboard("{Control>}k{/Control}");
    expect(onFire).not.toHaveBeenCalled();
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("stops firing while unassigned and again after a reset", async () => {
    const user = userEvent.setup({ delay: null });
    const onFire = vi.fn();
    render(<Search onFire={onFire} />);
    act(() => settings.set("shortcuts.search", null));
    await user.keyboard("{Control>}k{/Control}");
    expect(onFire).not.toHaveBeenCalled();
    act(() => settings.reset("shortcuts.search"));
    await user.keyboard("{Control>}k{/Control}");
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("applies to screen shortcuts and to the create pair", async () => {
    const user = userEvent.setup({ delay: null });
    const today = vi.fn();
    const create = vi.fn();
    function Page() {
      useScreenHotkeys([{ shortcut: "today", callback: today }]);
      useCreateShortcut(create);
      return null;
    }
    render(<Page />);
    await user.keyboard("t");
    expect(today).toHaveBeenCalledTimes(1);
    act(() => settings.set("shortcuts.today", "G"));
    await user.keyboard("t");
    expect(today).toHaveBeenCalledTimes(1);
    await user.keyboard("g");
    expect(today).toHaveBeenCalledTimes(2);
    act(() => settings.set("shortcuts.create", "X"));
    await user.keyboard("c");
    expect(create).not.toHaveBeenCalled();
    await user.keyboard("x");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never runs two shortcuts on one key, even when settings.json says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const user = userEvent.setup({ delay: null });
    const search = vi.fn();
    const jot = vi.fn();
    function Both() {
      useAppHotkey("search", search);
      useAppHotkey("quickJot", jot);
      return null;
    }
    render(<Both />);
    act(() => settings.set("shortcuts.quickJot", "Mod+K"));
    await user.keyboard("{Control>}k{/Control}");
    expect(jot).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
  });
});
