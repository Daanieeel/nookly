import {
  type EntityRecord,
  attachLabel,
  createLabel,
  detachLabel,
  moveEntity,
} from "@nookly/shared/data";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useEntityLabels, useLabels, useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";

/// The labels of an item's Space, those on it checked: tap to put one on or take it off,
/// or type a new one. The desktop's Labels popover and submenu.
export function LabelPicker({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { data: labels = [] } = useLabels(spaceId);
  const { data: attached = [] } = useEntityLabels(entityId);
  const toggle = useLocalWrite((db, input: { labelId: string; on: boolean }) =>
    input.on ? attachLabel(db, entityId, input.labelId) : detachLabel(db, entityId, input.labelId),
  );
  const add = useLocalWrite(async (db, name: string) => {
    const id = await createLabel(db, spaceId, name);
    await attachLabel(db, entityId, id);
  });
  return (
    <OptionList
      label="Labels"
      multiple
      searchPlaceholder="Find or make a label"
      values={attached.map((l) => l.id)}
      options={labels.map((label) => ({
        id: label.id,
        label: label.name,
        icon: <View className="size-2 rounded-full" style={{ backgroundColor: label.color }} />,
      }))}
      onToggle={(labelId, on) => toggle.mutate({ labelId, on })}
      onCreate={(name) => add.mutate(name)}
    />
  );
}

/// Moves an item, with everything that belongs to it, to another Space. Labels of the old
/// Space come off; the new Space gets the module the item needs.
export function MovePicker({ entity }: { entity: EntityRecord }) {
  const sheet = useSheet();
  const { data: spaces = [] } = useSpaces();
  const move = useLocalWrite((db, spaceId: string) => moveEntity(db, entity.id, spaceId));
  const others = spaces.filter((s) => s.id !== entity.spaceId);
  return (
    <View className="gap-3">
      <Text tone="muted">
        Sub-tasks, sessions and the notes that belong to it move along. Its labels stay behind,
        since each Space has its own.
      </Text>
      {others.length === 0 ? (
        <Text tone="muted">No other Spaces yet.</Text>
      ) : (
        <OptionList
          label="Spaces"
          options={others.map((s) => ({
            id: s.id,
            label: s.name,
            icon: <SpaceDot color={s.color} />,
          }))}
          value={null}
          onChange={(spaceId) => move.mutate(spaceId, { onSuccess: () => sheet?.close() })}
        />
      )}
      {move.error ? <Text tone="destructive">{move.error.message}</Text> : null}
    </View>
  );
}
