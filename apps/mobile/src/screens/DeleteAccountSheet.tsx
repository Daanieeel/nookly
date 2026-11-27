import { providerName } from "@nookly/shared/api";
import {
  IconCloudX,
  IconDeviceMobile,
  IconLock,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { useDeviceWord } from "../ui/device-word.ts";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { Points } from "../ui/sheet/Confirm.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";

/// Deleting the account removes it and everything on the server. This phone keeps its data.
/// The sheet says so, and asks for the password: that is the confirmation. An account made
/// with another provider has none: it types a phrase, then signs in with that provider again.
const DELETE_PHRASE = "delete my account";

export function DeleteAccountSheet() {
  const sheet = useSheet();
  const device = useDeviceWord();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const { data: account } = useQuery({
    queryKey: keys.sync.account,
    queryFn: async () => (await sync.account()?.me()) ?? null,
  });
  const hasPassword = account?.hasPassword !== false;
  const provider = hasPassword ? null : (account?.providers?.[0] ?? null);
  const remove = useMutation({
    mutationFn: async () => {
      // The provider vouches for the person before the account goes. Closing its browser is a
      // change of mind, not an error.
      if (provider && !(await sync.confirmWithProvider(provider))) return false;
      await sync.account()?.deleteAccount(hasPassword ? password : undefined);
      // The account is gone: what is on this phone is the only copy, and stays.
      await sync.detach();
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) {
        remove.reset();
        return;
      }
      queryClient.removeQueries({ queryKey: keys.sync.root });
      sheet?.close();
    },
  });
  return (
    <View className="gap-3">
      <Points
        points={[
          { icon: IconCloudX, text: "Removed from the server for good" },
          { icon: IconDeviceMobile, text: `This ${device} keeps its data` },
          ...(provider
            ? [
                {
                  icon: IconShieldLock,
                  text: `You sign in with ${providerName(provider)} once more`,
                },
              ]
            : []),
        ]}
      />
      {hasPassword ? (
        <Field
          label="Your password"
          icon={<FieldIcon icon={IconLock} />}
          placeholder="Your password"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
      ) : (
        <Field
          label="Type delete my account"
          icon={<FieldIcon icon={IconTrash} />}
          placeholder={DELETE_PHRASE}
          autoCapitalize="none"
          autoCorrect={false}
          value={phrase}
          onChangeText={setPhrase}
        />
      )}
      <Button
        size="lg"
        variant="destructive"
        label="Delete Account"
        disabled={hasPassword ? !password : phrase.trim().toLowerCase() !== DELETE_PHRASE}
        status={statusOf(remove)}
        errorLabel="Couldn't delete it"
        onPress={() => remove.mutate()}
      />
      {remove.error ? <Text tone="destructive">{remove.error.message}</Text> : null}
    </View>
  );
}
