import { PAGE_BACKGROUND, cn } from "./classes.ts";
import { RefreshControl, ScrollView } from "react-native";

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
  return (
    <ScrollView
      className={cn("flex-1", PAGE_BACKGROUND)}
      contentContainerClassName="gap-5 p-4 pb-12"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}
