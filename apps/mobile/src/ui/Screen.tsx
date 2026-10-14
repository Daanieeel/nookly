import { RefreshControl, ScrollView, View } from "react-native";
import { useTheme } from "./theme.ts";

/// A screen's scrolling page on the app's background, with pull to sync.
export function Screen({
  children,
  onRefresh,
  refreshing = false,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: theme.space(4),
        gap: theme.space(5),
        paddingBottom: theme.space(12),
      }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <View style={{ gap: theme.space(5) }}>{children}</View>
    </ScrollView>
  );
}
