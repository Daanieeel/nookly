import { IconArchive } from "@tabler/icons-react-native";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { View } from "react-native";
import { useAppData } from "../../data/context.tsx";
import { Button } from "../../ui/Button.tsx";
import { SectionHeader } from "../../ui/kit/GroupedSection.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { SPACE } from "../../ui/tokens.ts";
import { CardActions, CardHead, type CardTone, SettingsCard } from "./cards.tsx";

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
  const tone: CardTone = state === "failed" ? "error" : state === "done" ? "ok" : "idle";
  return (
    <View style={{ gap: SPACE.sm }}>
      <SectionHeader title="Back up now" />
      <SettingsCard tone={tone}>
        <CardHead
          icon={IconArchive}
          tone={tone}
          title="A backup of this phone"
          detail={
            state === "done" || state === "failed"
              ? message
              : "One file with every Space, note, file record, deck and setting on this phone. The newest three stay on the phone too."
          }
        />
        <CardActions>
          <Button
            label={state === "working" ? "Backing Up" : "Back Up Now"}
            disabled={!backup || state === "working"}
            onPress={() => void run()}
          />
        </CardActions>
      </SettingsCard>
      <Label type="footnote" color="secondaryLabel" style={{ paddingHorizontal: SPACE.lg }}>
        To restore, sign in on a new phone: your account brings everything back and never replaces
        what is already here.
      </Label>
    </View>
  );
}
