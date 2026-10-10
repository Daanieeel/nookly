import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { qk } from "#/lib/query-keys.ts";
import { type View, useNavStore } from "#/lib/store/nav.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { useEscapeBack } from "./use-escape-back.ts";

const list: View = { kind: "module", spaceId: "space-1", module: "notes" };
const page: View = { kind: "entity", entityId: "note-1", spaceId: "space-1" };

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData(qk.entity.byId("note-1"), makeEntity({ id: "note-1", type: "note" }));
  useNavStore.setState({ view: page, backStack: [list], forwardStack: [] });
  renderHook(() => useEscapeBack(), { wrapper });
});

afterEach(() => {
  document.body.replaceChildren();
});

/// Presses Escape on `target` and reports whether the key's default (leaving macOS
/// fullscreen) was cancelled.
function escape(target: Element = document.body): boolean {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("Escape on a page", () => {
  it("goes back to the list it was opened from", () => {
    escape();
    expect(useNavStore.getState().view).toEqual(list);
  });

  it("keeps the app out of fullscreen exit", () => {
    expect(escape()).toBe(true);
  });

  it("goes to the module list when there is nothing to go back to", () => {
    useNavStore.setState({ backStack: [] });
    escape();
    expect(useNavStore.getState().view).toEqual(list);
  });

  it("only closes an open dialog", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    escape();
    expect(useNavStore.getState().view).toEqual(page);
  });

  it.each(["menu", "listbox", "alertdialog"])("only closes an open %s", (role) => {
    const open = document.createElement("div");
    open.setAttribute("role", role);
    document.body.append(open);
    escape();
    expect(useNavStore.getState().view).toEqual(page);
  });

  it("only leaves a text field, then goes back on the next press", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    escape(input);
    expect(document.activeElement).not.toBe(input);
    expect(useNavStore.getState().view).toEqual(page);
    escape();
    expect(useNavStore.getState().view).toEqual(list);
  });

  it("only leaves the editor when typing in it", () => {
    const editable = document.createElement("div");
    editable.tabIndex = 0;
    // jsdom does not implement contenteditable.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(editable);
    editable.focus();
    escape(editable);
    expect(document.activeElement).not.toBe(editable);
    expect(useNavStore.getState().view).toEqual(page);
  });

  it("leaves a view that handles Escape itself alone", () => {
    const owner = document.createElement("div");
    owner.setAttribute("data-owns-escape", "");
    document.body.append(owner);
    escape();
    expect(useNavStore.getState().view).toEqual(page);
  });

  it("does nothing when something else already used the key", () => {
    // A handler on the target runs before the window's, like block selection's.
    const target = document.createElement("div");
    target.addEventListener("keydown", (e) => e.preventDefault());
    document.body.append(target);
    escape(target);
    expect(useNavStore.getState().view).toEqual(page);
  });
});

describe("Escape elsewhere", () => {
  it("does not navigate away from a list, but still keeps the window out of fullscreen exit", () => {
    useNavStore.setState({ view: list, backStack: [page] });
    expect(escape()).toBe(true);
    expect(useNavStore.getState().view).toEqual(list);
  });
});
