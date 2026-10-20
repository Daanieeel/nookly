import { IconDeviceFloppy } from "@tabler/icons-react-native";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { View } from "react-native";
import { useAppData } from "../../data/context.tsx";
import { Button } from "../../ui/Button.tsx";
import { Section } from "../../ui/Row.tsx";
import { Text } from "../../ui/Text.tsx";

/// A copy of everything on this phone, checked after it is written, handed to the share
/// sheet to keep in Files or send to the computer. Restoring is done by signing in: the
/// account holds everything, and nothing on the phone is replaced.
export function BackupPage() {
  const { backup } = useAppData();
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [message, setMessage] = useState("");
  const run = async () => {
    if (!backup) return;
    setState("working");
    try {
      const { path } = await backup();
      setState("done");
      setMessage("Backup made and checked.");
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
    } catch (error) {
      setState("failed");
      setMessage(error instanceof Error ? error.message : "The backup failed.");
    }
  };
  return (
    <View className="gap-4">
      <Section title="Back up now">
        <View className="gap-3 p-4">
          <Text tone="muted">
            One file with every Space, note, file record, deck and setting on this phone. The newest
            three stay on the phone too.
          </Text>
          <View className="items-start">
            <Button
              label="Back Up Now"
              icon={<IconDeviceFloppy size={16} />}
              disabled={!backup || state === "working"}
              onPress={() => void run()}
            />
          </View>
          {state === "done" || state === "failed" ? (
            <Text tone={state === "done" ? "positive" : "destructive"}>{message}</Text>
          ) : null}
        </View>
      </Section>
      <Text variant="small" tone="muted">
        To restore, sign in on a new phone: your account brings everything back and never replaces
        what is already here.
      </Text>
    </View>
  );
}
