import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useSyncState } from "../data/context.tsx";
import { Badge } from "../ui/Badge.tsx";
import { useConflictViews } from "./MergeEditor.tsx";

/// Invites a person to decide on changes two of their devices disagreed about on this
/// item. The page stays fully usable; this is only a nudge.
export function ConflictBadge({ entityId }: { entityId: string }) {
  const router = useRouter();
  const total = useSyncState((s) => s.status.conflicts);
  const { data: views = [] } = useConflictViews();
  const count = total > 0 ? views.filter((view) => view.itemId === entityId).length : 0;
  if (count === 0) return null;
  const label = count === 1 ? "1 change needs a look" : `${count} changes need a look`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Review`}
      onPress={() => router.push("/conflicts")}
    >
      <Badge variant="warning" label={label} />
    </Pressable>
  );
}
