import type { TwoFactorMethod } from "@nookly/shared/api";
import type { SignInOptions } from "@nookly/shared/sync";
import { useAppData } from "../data/context.tsx";
import { SecondStepForm } from "./SecondStepForm.tsx";

/// The second step of signing in, with a password or a provider. The first step went
/// through; the challenge stands for it for ten minutes.
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
  options: SignInOptions;
  onDone: () => void;
  onBack: () => void;
}) {
  const { sync } = useAppData();
  return (
    <SecondStepForm
      methods={methods}
      send={() => sync.sendTwoFactorEmail(serverUrl, challenge)}
      verify={(method, code) => sync.completeTwoFactor(serverUrl, challenge, method, code, options)}
      onDone={onDone}
      onBack={onBack}
      successLabel="Signed in"
      errorLabel="Couldn't sign in"
    />
  );
}
