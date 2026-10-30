import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { qk } from "#/lib/query-keys.ts";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { completeMoodleLogin, isMoodleCallback } from "./moodle-login.ts";

describe("isMoodleCallback", () => {
  it("recognizes only the sign in link", () => {
    expect(isMoodleCallback("nookly://token=YWJj")).toBe(true);
    expect(isMoodleCallback("  NOOKLY://token=YWJj ")).toBe(true);
    // A build next to the real app has a scheme of its own.
    expect(isMoodleCallback("nookly-dev://token=YWJj")).toBe(true);
    for (const other of [
      "nookly://open/66fd9c8e-3d3a-403a-b29d-89b2903c3c57",
      "https://nookly://token=abc",
      "token=abc",
      "",
    ]) {
      expect(isMoodleCallback(other)).toBe(false);
    }
  });
});

describe("completeMoodleLogin", () => {
  const status = {
    connected: true,
    needsReconnect: false,
    siteUrl: "https://m.edu",
    siteName: "Uni",
    fullName: "Ada",
  };

  it("hands the link to the app and refreshes what Moodle showed", async () => {
    mockCommand("moodle_finish_login", status);
    const queryClient = new QueryClient();
    queryClient.setQueryData(qk.moodle.status, { ...status, connected: false });
    await completeMoodleLogin(queryClient, "nookly://token=YWJj");
    expect(callsOf("moodle_finish_login")).toEqual([{ callback: "nookly://token=YWJj" }]);
    expect(queryClient.getQueryState(qk.moodle.status)?.isInvalidated).toBe(true);
  });

  it("keeps what it had when the app refuses the link", async () => {
    mockCommandWith("moodle_finish_login", () => {
      throw {
        kind: "Remote",
        message: "That sign in did not start from Nookly, so it was ignored.",
      };
    });
    const queryClient = new QueryClient();
    queryClient.setQueryData(qk.moodle.status, { ...status, connected: false });
    await completeMoodleLogin(queryClient, "nookly://token=evil");
    expect(queryClient.getQueryState(qk.moodle.status)?.isInvalidated).toBe(false);
  });
});
