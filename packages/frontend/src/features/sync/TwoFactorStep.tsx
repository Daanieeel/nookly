import type { TwoFactorMethod } from "@nookly/shared/api";
import { SecondStepForm } from "./SecondStepForm.tsx";
import { syncRuntime } from "./sync-instance.ts";

/// The second step of a sign in. The password or the provider was right; the challenge
/// stands for it for ten minutes.
export function TwoFactorStep({
  serverUrl,
  challenge,
  methods,
  options,
  onDone,
  onBack,
}: {
  serverUrl: string;
  challenge: string;
  methods: TwoFactorMethod[];
  options: Parameters<typeof syncRuntime.completeTwoFactor>[4];
  onDone: () => void;
  onBack: () => void;
}) {
  return (
    <SecondStepForm
      methods={methods}
      send={() => syncRuntime.sendTwoFactorEmail(serverUrl, challenge)}
      verify={(method, code) =>
        syncRuntime.completeTwoFactor(serverUrl, challenge, method, code, options)
      }
      onDone={onDone}
      onBack={onBack}
      successLabel="Signed in"
      errorLabel="Couldn't sign in"
    />
  );
}
