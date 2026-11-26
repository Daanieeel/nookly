import { createStore } from "zustand/vanilla";
import { ApiRequestError, type ApiClient } from "./client.ts";
import { needsRecheck } from "./two-factor.ts";

/// Changing how an account signs in asks the person to confirm it is them, when they last
/// did more than ten minutes ago. Both apps do it the same way: the change is tried, the
/// server asks, the question opens, and the change is tried again.

/// The person closed the question: the change simply doesn't happen.
export class RecheckCancelled extends Error {
  constructor() {
    super("Not confirmed.");
    this.name = "RecheckCancelled";
  }
}

/// What a change that failed says; nothing when the person dropped it themselves.
export const errorToShow = (error: Error | null): string | null =>
  error === null || error instanceof RecheckCancelled ? null : error.message;

export function createRecheckGate() {
  /// `asking` while the question should be on screen.
  const store = createStore<{ asking: boolean }>(() => ({ asking: false }));
  let waiting: ((confirmed: boolean) => void)[] = [];
  const ask = () =>
    new Promise<boolean>((resolve) => {
      waiting.push(resolve);
      store.setState({ asking: true });
    });
  return {
    store,
    /// Runs a change, asking the person first when the server wants that.
    async run<T>(change: () => Promise<T>): Promise<T> {
      try {
        return await change();
      } catch (error) {
        if (!(error instanceof Error) || !needsRecheck(error)) throw error;
        if (!(await ask())) throw new RecheckCancelled();
        return change();
      }
    },
    /// The question is over: confirmed, or closed.
    finish(confirmed: boolean) {
      const done = waiting;
      waiting = [];
      store.setState({ asking: false });
      for (const resolve of done) resolve(confirmed);
    },
  };
}
export type RecheckGate = ReturnType<typeof createRecheckGate>;

/// Sends what the person gave. `secondStep` when the account also wants a sign in code.
export async function submitRecheck(
  api: Pick<ApiClient, "recheck">,
  input: Parameters<ApiClient["recheck"]>[0],
): Promise<"done" | "secondStep"> {
  try {
    await api.recheck(input);
    return "done";
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "second_step_required") {
      return "secondStep";
    }
    throw error;
  }
}
