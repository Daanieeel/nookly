import type { EntityRecord } from "@nookly/shared/data";
import { View } from "react-native";
import type { Column } from "../ui/DataTable.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Text } from "../ui/Text.tsx";
import { ago } from "./dates.ts";

/// The columns a tablet's tables of items share (3.3): the title with the item's icon,
/// `muted` for what is deleted.
export function titleColumn(muted = false): Column<EntityRecord> {
  return {
    id: "title",
    label: "Title",
    width: "fill",
    sortValue: (e) => e.title,
    render: (e) => (
      <View className="flex-row items-center gap-2">
        <EntityIcon type={e.type} icon={e.icon} size={16} />
        <Text numberOfLines={1} className={muted ? "flex-1 text-muted-foreground" : "flex-1"}>
          {e.title || "Untitled"}
        </Text>
      </View>
    ),
  };
}

/// The item's key, as the desktop sets it.
export const KEY_COLUMN: Column<EntityRecord> = {
  id: "key",
  label: "Key",
  width: 90,
  hideBelow: 520,
  sortValue: (e) => e.key,
  render: (e) => (
    <Text variant="small" tone="muted" className="font-mono">
      {e.key}
    </Text>
  ),
};

/// When it last changed.
export const EDITED_COLUMN: Column<EntityRecord> = {
  id: "edited",
  label: "Edited",
  width: 110,
  sortValue: (e) => e.updatedAt,
  render: (e) => <Text tone="muted">{ago(e.updatedAt)}</Text>,
};
