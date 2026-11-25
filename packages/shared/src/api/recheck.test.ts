import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./client.ts";
import { providerName } from "./provider-sign-in.ts";
import { RecheckCancelled, createRecheckGate, errorToShow, submitRecheck } from "./recheck.ts";
import type { Recheck } from "./schemas.ts";

const asked = () => new ApiRequestError(403, "recheck_required", "Confirm it's you to continue.");

/// A change that the server refuses until the person has confirmed it is them.
function guarded() {
  const state = { confirmed: false, runs: 0 };
  return {
    state,
    change: async () => {
      state.runs += 1;
      if (!state.confirmed) throw asked();
      return "changed";
    },
  };
}

describe("a change that needs a recheck", () => {
  it("asks, then goes through once the person has confirmed", async () => {
    const gate = createRecheckGate();
    const { state, change } = guarded();
    const result = gate.run(change);
    await expect.poll(() => gate.store.getState().asking).toBe(true);
    state.confirmed = true;
    gate.finish(true);
    expect(await result).toBe("changed");
    expect(state.runs).toBe(2);
    expect(gate.store.getState().asking).toBe(false);
  });

  it("is dropped when the person closes the question, which is not an error to show", async () => {
    const gate = createRecheckGate();
    const { state, change } = guarded();
    const result = gate.run(change).catch((error: Error) => error);
    await expect.poll(() => gate.store.getState().asking).toBe(true);
    gate.finish(false);
    const error = await result;
    expect(error).toBeInstanceOf(RecheckCancelled);
    expect(errorToShow(error instanceof Error ? error : null)).toBeNull();
    expect(state.runs).toBe(1);
  });

  it("asks nothing when the change goes through or fails for another reason", async () => {
    const gate = createRecheckGate();
    expect(await gate.run(async () => "fine")).toBe("fine");
    const failed = new Error("The server said no.");
    await expect(
      gate.run(async () => {
        throw failed;
      }),
    ).rejects.toBe(failed);
    expect(errorToShow(failed)).toBe("The server said no.");
    expect(errorToShow(null)).toBeNull();
    expect(gate.store.getState().asking).toBe(false);
  });
});

describe("confirming it is you", () => {
  function api(answer: ApiRequestError | null) {
    const sent: Recheck[] = [];
    return {
      sent,
      recheck: async (input: Recheck) => {
        sent.push(input);
        if (answer) throw answer;
      },
    };
  }

  it("is done with the first step alone on an account without two-factor", async () => {
    const account = api(null);
    expect(await submitRecheck(account, { password: "a long password" })).toBe("done");
    expect(account.sent).toEqual([{ password: "a long password" }]);
  });

  it("goes on to a code when the account has two-factor", async () => {
    const account = api(new ApiRequestError(403, "second_step_required", "Enter a sign in code."));
    expect(await submitRecheck(account, {})).toBe("secondStep");
  });

  it("passes a wrong password on", async () => {
    const account = api(new ApiRequestError(403, "wrong_password", "The password is wrong."));
    await expect(submitRecheck(account, { password: "no" })).rejects.toThrow("wrong");
  });
});

describe("the names of the ways to sign in", () => {
  it("calls an email and password Nookly Signin", () => {
    expect(providerName("credential")).toBe("Nookly Signin");
    expect(providerName("github")).toBe("GitHub");
  });
});
