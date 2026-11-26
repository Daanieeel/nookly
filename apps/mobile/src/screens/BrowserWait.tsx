import { providerName } from "@nookly/shared/api";
import { View } from "react-native";
import { useAppData } from "../data/context.tsx";
import { Button } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";

/// While a provider is open in the browser: what is being waited for, and the way to stop.
export function BrowserWait({ provider }: { provider: string | null }) {
  const { sync } = useAppData();
  if (provider === null) return null;
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-2">
      <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
        {`Waiting for ${providerName(provider)} in your browser`}
      </Text>
      <Button variant="ghost" label="Stop Waiting" onPress={() => sync.cancelProviderSignIn()} />
    </View>
  );
}
