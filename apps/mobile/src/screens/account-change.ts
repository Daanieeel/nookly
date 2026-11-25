import { RecheckCancelled } from "@nookly/shared/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { recheck } from "./recheck.ts";

/// The signed in account's API, asked for when it is used.
export function useAccount() {
  const { sync } = useAppData();
  return () => {
    const api = sync.account();
    if (!api) throw new Error("Sign in first.");
    return api;
  };
}

/// A change to how the account signs in: asks the person to confirm it is them when the
/// server wants that (`RecheckPrompt` shows the question), then reads the account again so
/// every view of it is right.
export function useAccountChange<Input, Result>(
  change: (input: Input) => Promise<Result>,
  onDone?: (result: Result, input: Input) => void,
) {
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Input) => recheck.run(() => change(input)),
    // A question that was closed is a change of mind: nothing failed.
    onError: (error) => {
      if (error instanceof RecheckCancelled) mutation.reset();
    },
    onSuccess: async (result, input) => {
      for (const queryKey of [
        keys.sync.signIn,
        keys.sync.account,
        keys.sync.security,
        keys.sync.sessions,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      // What the account owes may have changed too; a signed out phone has nothing to read.
      await sync.twoFactorChanged().catch(() => {});
      onDone?.(result, input);
    },
  });
  return mutation;
}
