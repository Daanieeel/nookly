import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "#/lib/query-keys.ts";
import { recheck } from "./recheck-gate.ts";
import { syncRuntime } from "./sync-instance.ts";

/// A change to how the account signs in: asks the person to confirm it is them when the
/// server wants that, then reads the account again so every view of it is right.
export function useAccountChange<Input, Result>(
  change: (input: Input) => Promise<Result>,
  onDone?: (result: Result, input: Input) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => recheck.run(() => change(input)),
    onSuccess: async (result, input) => {
      for (const queryKey of [
        qk.sync.signIn,
        qk.sync.account,
        qk.sync.security,
        qk.sync.sessions,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      // What the account owes may have changed too; a signed out device has nothing to read.
      await syncRuntime.twoFactorChanged().catch(() => {});
      onDone?.(result, input);
    },
  });
}
