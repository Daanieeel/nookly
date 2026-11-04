import { emit } from "@tauri-apps/api/event";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { qk } from "#/lib/query-keys.ts";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { completeMoodleLogin, listenForMoodleLogin } from "./moodle-login.ts";

const signInState = (queryClient: QueryClient) => queryClient.getQueryData(qk.moodle.signIn);

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

  it("keeps the reason on the page, where a toast that came and went is not missed", async () => {
    mockCommandWith("moodle_finish_login", () => {
      throw {
        kind: "Remote",
        message: "No Moodle sign in is waiting. Start it again from Nookly.",
      };
    });
    const queryClient = new QueryClient();
    await completeMoodleLogin(queryClient, "nookly://token=evil");
    expect(signInState(queryClient)).toEqual({
      kind: "failed",
      message: "No Moodle sign in is waiting. Start it again from Nookly.",
    });
  });

  it("says it is finishing while the app talks to Moodle, and forgets a failure once it works", async () => {
    const during: unknown[] = [];
    const queryClient = new QueryClient();
    queryClient.setQueryData(qk.moodle.signIn, { kind: "failed", message: "old" });
    mockCommandWith("moodle_finish_login", () => {
      during.push(signInState(queryClient));
      return status;
    });
    await completeMoodleLogin(queryClient, "nookly://token=YWJj");
    expect(during).toEqual([{ kind: "finishing" }]);
    expect(signInState(queryClient)).toBeNull();
  });
});

describe("the sign in inside the app", () => {
  it("finishes the sign in with the link it caught, until the app stops listening", async () => {
    mockCommand("moodle_finish_login", {
      connected: true,
      needsReconnect: false,
      siteUrl: "https://m.edu",
      siteName: "Uni",
      fullName: "Ada",
    });
    const stop = await listenForMoodleLogin(new QueryClient());
    await emit("moodle-callback", "nookly-dev://token=YWJj");
    await vi.waitFor(() =>
      expect(callsOf("moodle_finish_login")).toEqual([{ callback: "nookly-dev://token=YWJj" }]),
    );
    stop();
    await emit("moodle-callback", "nookly-dev://token=eHl6");
    expect(callsOf("moodle_finish_login")).toHaveLength(1);
  });

  it("keeps the reason on the page when the sign in sheet could not finish", async () => {
    const queryClient = new QueryClient();
    const stop = await listenForMoodleLogin(queryClient);
    await emit("moodle-login-failed", "The sign in ended without a result.");
    await vi.waitFor(() =>
      expect(signInState(queryClient)).toEqual({
        kind: "failed",
        message: "The sign in ended without a result.",
      }),
    );
    stop();
  });
});
