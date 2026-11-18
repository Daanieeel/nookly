import { type EntityRecord, refineJot, setPinned, trashEntity } from "@nookly/shared/data";
import {
  IconDots,
  IconNotes,
  IconPinned,
  IconPinnedOff,
  IconTrash,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useWrite } from "../data/context.tsx";
import { type SwipeAction, SwipeRow } from "../ui/SwipeRow.tsx";
import { useEntityMenu } from "./entity-actions.tsx";

/// What swiping an item's row does, the same in every list (D76). Left to right: the type's
/// own actions (a task scheduled, a jot refined, a bookmark's address copied), then Pin; a
/// long drag runs the first. Right to left: More, the item's menu, then Trash, always the
/// rightmost, which a long drag runs.
export function useEntitySwipe() {
  const write = useWrite();
  const router = useRouter();
  const entityMenu = useEntityMenu();
  return (entity: EntityRecord, own: SwipeAction[] = []) => {
    const typed: SwipeAction[] =
      entity.type === "jot"
        ? [
            {
              label: "Refine",
              icon: IconNotes,
              tone: "accent",
              onPress: () =>
                write(async (db) => {
                  const id = await refineJot(db, entity.id);
                  router.push(`/entity/${id}`);
                }),
            },
          ]
        : [];
    const leading: SwipeAction[] = [
      ...own,
      ...typed,
      {
        label: entity.pinned ? "Unpin" : "Pin",
        icon: entity.pinned ? IconPinnedOff : IconPinned,
        tone: "warning",
        onPress: () => write((db) => setPinned(db, entity.id, !entity.pinned)),
      },
    ];
    const trailing: SwipeAction[] = [
      { label: "More", icon: IconDots, tone: "neutral", onPress: () => entityMenu(entity) },
      {
        label: "Trash",
        icon: IconTrash,
        tone: "destructive",
        onPress: () => write((db) => trashEntity(db, entity.id)),
      },
    ];
    return { leading, trailing };
  };
}

/// An item's row in a list with its swipe actions (`useEntitySwipe`).
export function EntitySwipe({
  entity,
  own,
  children,
}: {
  entity: EntityRecord;
  /// The row's own actions first on the left, as a task's scheduling.
  own?: SwipeAction[];
  children: ReactNode;
}) {
  const swipe = useEntitySwipe()(entity, own);
  return (
    <SwipeRow leading={swipe.leading} trailing={swipe.trailing}>
      {children}
    </SwipeRow>
  );
}
