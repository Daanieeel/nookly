import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useAppData, useSyncState } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { useDeviceWord } from "../ui/device-word.ts";
import { useOptionalSheetHost } from "../ui/sheet/SheetHost.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { LegalLink } from "./legal.tsx";
import { useTermsGate } from "./terms-gate-store.ts";

/// What the sheet says and does: agree, and sync, which waited for it, carries on.
function TermsSheet() {
  const sheet = useSheet();
  const device = useDeviceWord();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const agree = useMutation({
    mutationFn: () => sync.acceptTerms(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.sync.root });
      sheet?.close();
    },
  });
  return (
    <View className="gap-4">
      <Text tone="muted">
        Nookly's sync service has terms of use and a privacy policy. Sync stays paused on this{" "}
        {device} until you agree. Everything already on it keeps working.
      </Text>
      <Text tone="muted">
        By continuing you confirm that you are at least 18 and agree to the{" "}
        <LegalLink page="terms" /> and have read the <LegalLink page="privacy" />.
      </Text>
      {agree.error ? <Text tone="destructive">{agree.error.message}</Text> : null}
      <Button
        size="lg"
        label="Agree and Continue"
        status={statusOf(agree)}
        successLabel="Agreed"
        errorLabel="Couldn't agree"
        onPress={() => agree.mutate()}
      />
      <Button
        variant="ghost"
        label="Not Now"
        onPress={() => {
          useTermsGate.getState().dismiss();
          sheet?.close();
        }}
      />
    </View>
  );
}

/// Rises when the account has not agreed to the terms of Nookly's own server, or not to their
/// latest version, and again when Settings asks for it. Mounted once, inside the sheet host.
export function TermsGate() {
  const host = useOptionalSheetHost();
  const pending = useSyncState((state) => state.termsPending);
  const dismissed = useTermsGate((state) => state.dismissed);
  const reopened = useTermsGate((state) => state.reopened);
  const shown = useRef(-1);
  useEffect(() => {
    if (!pending) {
      shown.current = -1;
      return;
    }
    if (dismissed || shown.current === reopened) return;
    shown.current = reopened;
    host?.present({ title: "Agree to the terms to keep syncing", content: <TermsSheet /> });
  }, [pending, dismissed, reopened, host]);
  return null;
}
