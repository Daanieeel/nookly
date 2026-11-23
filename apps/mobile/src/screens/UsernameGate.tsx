import { USERNAME_PATTERN, USERNAME_RULE, suggestUsername } from "@nookly/shared/api";
import { IconUser } from "@tabler/icons-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAppData, useSyncState } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { useOptionalSheetHost } from "../ui/sheet/SheetHost.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useUsernameGate } from "./username-gate-store.ts";

/// What the sheet says and does: pick a username, once.
function UsernameSheet() {
  const sheet = useSheet();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const account = useSyncState((state) => state.user);
  const [name, setName] = useState(() => suggestUsername(account?.username ?? ""));
  const [invalid, setInvalid] = useState(false);
  const choose = useMutation({
    mutationFn: (username: string) => sync.chooseUsername(username),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.sync.root });
      sheet?.close();
    },
  });
  const save = () => {
    const username = name.trim();
    if (!USERNAME_PATTERN.test(username)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    choose.mutate(username);
  };
  return (
    <View className="gap-4">
      <Text tone="muted">
        Your account was made with another account, so it has no username yet. People you share with
        see it. You can pick it once.
      </Text>
      <Field
        label="Username"
        icon={<FieldIcon icon={IconUser} />}
        showName
        placeholder="Username"
        required
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        autoComplete="username"
        editable={!choose.isPending}
        invalid={invalid}
        value={name}
        onChangeText={(next) => {
          setInvalid(false);
          setName(next);
        }}
        error={invalid ? USERNAME_RULE : undefined}
      />
      {choose.error ? <Text tone="destructive">{choose.error.message}</Text> : null}
      <Button
        size="lg"
        label="Save Username"
        status={statusOf(choose)}
        successLabel="Saved"
        errorLabel="Couldn't save it"
        onPress={save}
      />
      <Button
        variant="ghost"
        label="Not Now"
        onPress={() => {
          useUsernameGate.getState().dismiss();
          sheet?.close();
        }}
      />
    </View>
  );
}

/// Rises once after signing in with another account, which has no username yet. Putting it
/// off is fine: the account works under the name the other account gave it. Mounted once,
/// inside the sheet host.
export function UsernameGate() {
  const host = useOptionalSheetHost();
  const needs = useSyncState((state) => state.user?.needsUsername === true);
  const dismissed = useUsernameGate((state) => state.dismissed);
  const shown = useRef(false);
  useEffect(() => {
    if (!needs) {
      shown.current = false;
      return;
    }
    if (dismissed || shown.current) return;
    shown.current = true;
    host?.present({ title: "Choose a username", content: <UsernameSheet /> });
  }, [needs, dismissed, host]);
  return null;
}
