import {
  RECHECK_COPY,
  errorToShow,
  providerName,
  recheckWays,
  submitRecheck,
} from "@nookly/shared/api";
import { IconLock } from "@tabler/icons-react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { create, useStore } from "zustand";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { ProviderMark } from "../ui/ProviderMark.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { useAccount } from "./account-change.ts";
import { BrowserWait } from "./BrowserWait.tsx";
import { recheck } from "./recheck.ts";
import { SecondStepForm } from "./SecondStepForm.tsx";

/// The first step is the password or a provider; an account with two-factor then gives a code.
function RecheckForm() {
  const theme = useTheme();
  const { sync } = useAppData();
  const account = useAccount();
  const [password, setPassword] = useState("");
  // The first step went through and a code is wanted too, with the password it had.
  const [second, setSecond] = useState<{ password?: string } | null>(null);
  const { data: summary, error } = useQuery({
    queryKey: keys.sync.signIn,
    queryFn: () => account().signInMethods(),
  });
  const first = useMutation({
    mutationFn: async (input: { password: string } | { provider: string }) => {
      if ("password" in input) return submitRecheck(account(), input);
      if (!(await sync.confirmWithProvider(input.provider))) return "closed";
      return submitRecheck(account(), {});
    },
    onSuccess: (outcome, input) => {
      if (outcome === "done") recheck.finish(true);
      if (outcome === "secondStep") {
        setSecond("password" in input ? { password: input.password } : {});
      }
    },
  });
  if (second && summary) {
    return (
      <SecondStepForm
        methods={summary.secondStep}
        send={() => account().sendRecheckCode()}
        verify={(method, code) => account().recheck({ ...second, method, code })}
        onDone={() => recheck.finish(true)}
        onBack={() => {
          setSecond(null);
          first.reset();
        }}
        successLabel="Confirmed"
        errorLabel="Couldn't confirm"
      />
    );
  }
  const ways = summary ? recheckWays(summary) : { password: false, providers: [] };
  const provider =
    first.variables && "provider" in first.variables ? first.variables.provider : null;
  const failed = errorToShow(error) ?? errorToShow(first.error);
  return (
    <View className="gap-3">
      <Text tone="muted">{RECHECK_COPY.text}</Text>
      {ways.password ? (
        <Field
          label="Password"
          icon={<FieldIcon icon={IconLock} />}
          showName
          placeholder="Password"
          required
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          editable={!first.isPending}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => password && first.mutate({ password })}
        />
      ) : null}
      {failed ? <Text tone="destructive">{failed}</Text> : null}
      {ways.password ? (
        <Button
          size="lg"
          label="Continue"
          disabled={!password}
          // The password's own button says nothing about a provider's attempt.
          status={provider === null ? statusOf(first) : undefined}
          successLabel="Confirmed"
          errorLabel="Couldn't confirm"
          onPress={() => first.mutate({ password })}
        />
      ) : null}
      {ways.providers.map((name) => (
        <Button
          key={name}
          size="lg"
          variant="secondary"
          label={`Continue with ${providerName(name)}`}
          icon={<ProviderMark provider={name} size={18} color={theme.colors.foreground} />}
          disabled={first.isPending}
          onPress={() => first.mutate({ provider: name })}
        />
      ))}
      <BrowserWait provider={first.isPending ? provider : null} />
      <Button variant="ghost" label="Cancel" onPress={() => recheck.finish(false)} />
    </View>
  );
}

/// The places that can show the question, the newest last. It shows in that one: the sheet
/// the change came from, so it can float over it.
const usePlaces = create<{ stack: symbol[] }>(() => ({ stack: [] }));

function useNewestPlace(): boolean {
  const [place] = useState(() => Symbol("recheck"));
  useEffect(() => {
    usePlaces.setState(({ stack }) => ({ stack: [...stack, place] }));
    return () => {
      usePlaces.setState(({ stack }) => ({ stack: stack.filter((other) => other !== place) }));
      // With nowhere left to ask, the change that waits is dropped.
      if (usePlaces.getState().stack.length === 0) recheck.finish(false);
    };
  }, [place]);
  return usePlaces(({ stack }) => stack.at(-1) === place);
}

/// "Confirm it's you", asked before a change to how the account signs in when the last
/// confirmation is more than ten minutes old. Closing it drops the change. Every page and
/// sheet step that makes such a change holds one.
export function RecheckPrompt() {
  const asking = useStore(recheck.store, (state) => state.asking);
  const here = useNewestPlace();
  return (
    <Sheet
      open={asking && here}
      onOpenChange={(open) => !open && recheck.finish(false)}
      title={RECHECK_COPY.title}
      kind="form"
      stacked
    >
      <RecheckForm />
    </Sheet>
  );
}
