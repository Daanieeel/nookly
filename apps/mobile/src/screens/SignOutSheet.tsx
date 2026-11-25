import {
  IconAlertTriangle,
  IconCloudCheck,
  IconCloudOff,
  IconDeviceMobile,
  IconFileOff,
  IconFolder,
} from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { CheckboxRow } from "../ui/CheckboxRow.tsx";
import { useDeviceWord } from "../ui/device-word.ts";
import { ConfirmButtons, type ConfirmPoint, Points } from "../ui/sheet/Confirm.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/// Signing out clears this phone unless a local copy is kept: said before it happens, with
/// what has not reached the account yet, which is backed up first. A warning, not a
/// deletion: the account keeps it. The desktop's sign out dialog.
export function SignOutSheet({
  keepByDefault = false,
}: {
  /// Whether "keep a local copy" starts ticked: signing out because the account can't go on
  /// without something the person isn't doing now.
  keepByDefault?: boolean;
}) {
  const sheet = useSheet();
  const device = useDeviceWord();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const [keep, setKeep] = useState(keepByDefault);
  const { data: unsent = 0 } = useQuery({
    queryKey: keys.sync.unsent,
    queryFn: () => sync.unsentCount(),
    gcTime: 0,
  });
  const { data: missing = 0 } = useQuery({
    queryKey: keys.sync.missingFiles,
    queryFn: () => sync.missingFilesCount(),
    enabled: keep,
    gcTime: 0,
  });
  const signOut = useMutation({
    mutationFn: () => sync.signOut({ keepLocalCopy: keep }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.sync.root });
      // Every screen showed the account's data, which is no longer on this phone.
      void queryClient.invalidateQueries();
      sheet?.close();
    },
  });
  const changes = plural(unsent, "change", "changes");
  const points: ConfirmPoint[] = [
    { icon: IconCloudCheck, text: "Stays in your account and on your other devices" },
    ...(keep
      ? [
          { icon: IconDeviceMobile, text: `A copy stays on this ${device} and works alone` },
          { icon: IconCloudOff, text: "Changes here no longer sync" },
        ]
      : [
          { icon: IconDeviceMobile, text: `Removed from this ${device}, back when you sign in` },
          { icon: IconFolder, text: "Files go too, except ones your account doesn't have yet" },
        ]),
  ];
  if (unsent > 0) {
    points.push({
      icon: IconAlertTriangle,
      tone: "caution",
      text: keep
        ? `${changes} not sent yet, kept here`
        : `${changes} not sent yet, backed up first`,
    });
  }
  if (keep && missing > 0) {
    points.push({
      icon: IconFileOff,
      tone: "caution",
      text: `${plural(missing, "file", "files")} not on this ${device} yet, missing from the copy`,
    });
  }
  return (
    <View className="gap-5">
      <Points points={points} />
      <CheckboxRow checked={keep} onChange={setKeep} label="Keep a local copy">
        <Text>Keep a local copy</Text>
      </CheckboxRow>
      {signOut.error ? <Text tone="destructive">{signOut.error.message}</Text> : null}
      <ConfirmButtons cancel="Stay Signed In">
        <Button
          size="lg"
          variant="warning"
          label="Sign Out"
          status={statusOf(signOut)}
          successLabel="Signed out"
          errorLabel="Couldn't sign out"
          onPress={() => signOut.mutate()}
        />
      </ConfirmButtons>
    </View>
  );
}
