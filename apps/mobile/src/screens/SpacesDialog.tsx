import { isSharedSpace } from "@nookly/shared/api";
import { type Space, reorderSpaces } from "@nookly/shared/data";
import { SPACE_SLOTS } from "@nookly/frontend/lib/space-row";
import { IconCheck } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useSpaces } from "../data/queries.ts";
import { SectionHeader } from "../ui/kit/GroupedSection.tsx";
import { Label } from "../ui/kit/Label.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { useSemantic } from "../ui/kit/scheme.ts";
import { EmptyState } from "../ui/kit/States.tsx";
import { ReorderList } from "../ui/ReorderList.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { SPACE } from "../ui/tokens.ts";
import { useTheme } from "../ui/theme.ts";
import { SpaceIcon } from "./SpaceIcon.tsx";

/// How many Spaces the sidebar's switcher shows when there are more than fit: the rest
/// wait behind its dots.
const IN_SIDEBAR = SPACE_SLOTS - 1;
const ROW = 52;

const nameOf = (space: Space) =>
  isSharedSpace(space.id) ? `${space.name}, Shared with you` : space.name;

/// Every Space in a dialog (D71): a search at the top, then all of them in their order. The
/// first three show in the sidebar, the rest below a line; dragging a Space across the
/// line moves it into the sidebar or out of it. A tap picks one.
export function SpacesDialog({
  activeId,
  onPick,
}: {
  activeId: string | null;
  onPick: (space: Space) => void;
}) {
  const { data: spaces = [] } = useSpaces();
  const [query, setQuery] = useState("");
  const close = useCloseSheet();
  const order = useLocalWrite((db, ids: string[]) => reorderSpaces(db, ids));
  const line = useSemantic("separator");
  const needle = query.trim().toLowerCase();
  const found = needle ? spaces.filter((s) => s.name.toLowerCase().includes(needle)) : [];
  const pick = (space: Space) => close(() => onPick(space));
  const row = (space: Space, reorder: boolean) => (
    <SpaceRowItem
      space={space}
      selected={space.id === activeId}
      onPress={() => pick(space)}
      reorder={reorder}
    />
  );
  return (
    <View style={{ gap: SPACE.sm }}>
      <SearchField label="Search Spaces" value={query} onChangeText={setQuery} />
      {needle ? (
        found.length === 0 ? (
          <EmptyState title="No Spaces" message="No Space has that name." />
        ) : (
          <View>
            {found.map((space) => (
              <View key={space.id}>{row(space, false)}</View>
            ))}
          </View>
        )
      ) : (
        <View>
          <SectionHeader title="In the sidebar" />
          <View>
            <ReorderList
              items={spaces}
              keyOf={(space) => space.id}
              labelOf={nameOf}
              size={ROW}
              handle
              onReorder={(ids) => order.mutate(ids)}
              renderItem={(space) => row(space, true)}
            />
            {spaces.length > IN_SIDEBAR ? (
              // The line between the Spaces in the sidebar and the rest. It stays put while
              // a row is dragged across it.
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: IN_SIDEBAR * ROW,
                  left: SPACE.md,
                  right: SPACE.md,
                  height: 1.5,
                  borderRadius: 1,
                  backgroundColor: line,
                }}
              />
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

function SpaceRowItem({
  space,
  selected,
  onPress,
  reorder,
}: {
  space: Space;
  selected: boolean;
  onPress: () => void;
  reorder: boolean;
}) {
  const theme = useTheme();
  const pressed = useSemantic("pressed");
  return (
    <Pressable
      accessibilityRole="button"
      // In the reorderable list the row's own label is the drag's; the press names the Space.
      accessibilityLabel={nameOf(space)}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed: down }) => ({
        height: reorder ? ROW : undefined,
        minHeight: ROW,
        flex: reorder ? 1 : undefined,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: SPACE.md,
        borderRadius: 12,
        backgroundColor: down ? pressed : undefined,
      })}
    >
      <SpaceIcon space={space} size={20} />
      <Label numberOfLines={1} style={{ flex: 1 }}>
        {space.name}
      </Label>
      {selected ? <IconCheck size={18} color={theme.colors.primary} /> : null}
    </Pressable>
  );
}
