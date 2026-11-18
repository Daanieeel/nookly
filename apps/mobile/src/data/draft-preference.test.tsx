import { act, renderHook } from "@testing-library/react-native";
import { z } from "zod";
import Storage from "../test/kv-store.ts";
import { forgetDrafts, useDraftPreference } from "./preferences.ts";
import { forgetPreferences } from "./preferences.ts";

const schema = z.object({ grouping: z.string() });
const FALLBACK = { grouping: "status" };
const stored = () => Storage.getItemSync("nookly.preference.tasks.display");

// A change to a page's filters or display used to be kept at once. As on the desktop, it is
// a change until Save keeps it or Discard drops it; the bar offering both shows meanwhile.
describe("a page's filters and display, changed but not yet saved", () => {
  beforeEach(() => {
    forgetPreferences();
    forgetDrafts();
  });

  it("shows the change, keeps nothing until saved, and drops it on Discard", () => {
    const { result } = renderHook(() => useDraftPreference("tasks.display", schema, FALLBACK));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.set({ grouping: "due" }));
    expect(result.current.value).toEqual({ grouping: "due" });
    expect(result.current.dirty).toBe(true);
    expect(stored()).toBeNull();
    act(() => result.current.discard());
    expect(result.current.value).toEqual(FALLBACK);
    expect(result.current.dirty).toBe(false);
  });

  it("keeps the change on Save", () => {
    const { result } = renderHook(() => useDraftPreference("tasks.display", schema, FALLBACK));
    act(() => result.current.set({ grouping: "due" }));
    act(() => result.current.save());
    expect(result.current.dirty).toBe(false);
    expect(JSON.parse(stored() ?? "null")).toEqual({ grouping: "due" });
  });

  it("is not a change when it is set back to what is saved", () => {
    const { result } = renderHook(() => useDraftPreference("tasks.display", schema, FALLBACK));
    act(() => result.current.set({ grouping: "due" }));
    act(() => result.current.set({ grouping: "status" }));
    expect(result.current.dirty).toBe(false);
  });

  it("outlives leaving the page, until the app quits", () => {
    const first = renderHook(() => useDraftPreference("tasks.display", schema, FALLBACK));
    act(() => first.result.current.set({ grouping: "due" }));
    first.unmount();
    const again = renderHook(() => useDraftPreference("tasks.display", schema, FALLBACK));
    expect(again.result.current.value).toEqual({ grouping: "due" });
    expect(again.result.current.dirty).toBe(true);
  });

  it("measures changes against an opened View instead of the page's own", () => {
    const { result } = renderHook(() => useDraftPreference("tasks.display", schema, FALLBACK));
    act(() => result.current.open({ id: "v1", value: { grouping: "label" } }));
    expect(result.current.viewId).toBe("v1");
    expect(result.current.value).toEqual({ grouping: "label" });
    expect(result.current.dirty).toBe(false);
    act(() => result.current.set({ grouping: "due" }));
    expect(result.current.dirty).toBe(true);
    // Saved into the View: the View is what it now compares with; the page's own stays.
    act(() => result.current.commit());
    expect(result.current.dirty).toBe(false);
    expect(stored()).toBeNull();
    expect(result.current.value).toEqual({ grouping: "due" });
    act(() => result.current.open(null));
    expect(result.current.value).toEqual(FALLBACK);
    expect(result.current.viewId).toBeNull();
  });
});
