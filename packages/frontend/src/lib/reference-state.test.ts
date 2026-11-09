import { describe, expect, it } from "vitest";
import { setDateTimeSettings } from "#/test/time.ts";
import type { ReferenceStateKey, ReferenceStatus } from "#/lib/api/types.ts";
import {
  canLocate,
  providerLabel,
  referenceStateLabel,
  referenceStateTone,
  referenceStateTooltip,
} from "./reference-state.ts";

const status = (state: ReferenceStateKey, asOf: string | null = null): ReferenceStatus => ({
  state,
  asOf,
});

describe("the five reference states", () => {
  it("name each state the same way everywhere", () => {
    expect(referenceStateLabel(status("available"))).toBe("Available");
    expect(referenceStateLabel(status("missing"))).toBe("Missing");
    expect(referenceStateLabel(status("needsSignIn"))).toBe("Needs sign in");
    expect(referenceStateLabel(status("notOnThisDevice"))).toBe("Not on this device");
    expect(referenceStateLabel(status("offline"))).toBe("Offline");
  });

  it("says when the last answer was for an offline target, and only then", () => {
    setDateTimeSettings({ dateFormat: "european", timeFormat: "european" });
    expect(referenceStateLabel(status("offline", "2026-11-03T10:00:00Z"))).toMatch(
      /^Offline, as of .*2026/,
    );
    expect(referenceStateLabel(status("available", "2026-11-03T10:00:00Z"))).toBe("Available");
  });

  it("explains every state in words for each kind of target", () => {
    const states: ReferenceStateKey[] = [
      "available",
      "offline",
      "missing",
      "needsSignIn",
      "notOnThisDevice",
    ];
    for (const provider of ["file", "link", "moodle_course", "moodle_assignment"] as const) {
      for (const state of states) {
        const text = referenceStateTooltip(status(state), provider);
        expect(text.length).toBeGreaterThan(10);
        // No dashes in copy.
        expect(text).not.toMatch(/[–—]/);
      }
    }
    expect(referenceStateTooltip(status("available"), "file")).toBe(
      "The file is found on this device.",
    );
    expect(referenceStateTooltip(status("available"), "moodle_course")).toBe("Moodle answers.");
    expect(referenceStateTooltip(status("missing"), "link")).toBe("The link is dead.");
  });

  it("gets louder the more the person has to do", () => {
    expect(referenceStateTone("available")).toBe("positive");
    expect(referenceStateTone("offline")).toBe("neutral");
    expect(referenceStateTone("notOnThisDevice")).toBe("neutral");
    expect(referenceStateTone("needsSignIn")).toBe("warning");
    expect(referenceStateTone("missing")).toBe("destructive");
  });

  it("offers Locate only where pointing at the file again helps", () => {
    expect(canLocate(status("missing"))).toBe(true);
    expect(canLocate(status("notOnThisDevice"))).toBe(true);
    for (const state of ["available", "offline", "needsSignIn"] as const) {
      expect(canLocate(status(state))).toBe(false);
    }
    expect(canLocate(null)).toBe(false);
  });

  it("names the kinds of target", () => {
    expect(providerLabel("file")).toBe("File on disk");
    expect(providerLabel("moodle_course")).toBe("Moodle course");
  });
});
