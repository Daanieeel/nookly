import { addSpaceModule, deleteSpace, listEntities, updateSpace } from "@nookly/shared/data";
import { MODULE_KEYS, MODULE_LABELS, isModuleKey } from "@nookly/shared/modules";
import type { Space } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { useSpaceModules } from "../data/queries.ts";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { useMenu } from "../ui/menu.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";

/// What a Space's settings and the tablet sidebar's Space menu both do to a Space.

/// Modules offered under Add Module: all of them but the passenger that comes with Courses.
const ADDABLE = MODULE_KEYS.filter((key) => key !== "semesters");

export function useUpdateSpace(spaceId: string) {
  return useLocalWrite((db, patch: { name?: string; color?: string; icon?: string }) =>
    updateSpace(db, spaceId, patch),
  );
}

/// The modules a Space does not have yet.
export function useAddableModules(spaceId: string) {
  const { data: modules = [] } = useSpaceModules(spaceId);
  const shown = modules.filter(isModuleKey);
  return ADDABLE.filter((key) => !shown.includes(key));
}

/// The modules a Space can add, searchable; a pick adds it and calls `onAdded`.
export function AddModuleList({ space, onAdded }: { space: Space; onAdded: () => void }) {
  const more = useAddableModules(space.id);
  const add = useLocalWrite((db, key: string) => addSpaceModule(db, space.id, key));
  return (
    <OptionList
      label="Modules"
      search
      value={null}
      options={more.map((key) => ({
        id: key,
        label: MODULE_LABELS[key],
        glyph: MODULE_ICONS[key],
        tint: space.color,
      }))}
      onChange={(key) => {
        onAdded();
        add.mutate(key);
      }}
    />
  );
}

/// Asks before deleting a Space and everything in it, counted when asked, the Space's name
/// typed to confirm (the desktop's `ConfirmPermanentDialog`).
export function useAskDeleteSpace(space: Space | undefined) {
  const db = useDb();
  const menu = useMenu();
  const router = useRouter();
  const destroy = useLocalWrite((db) => deleteSpace(db, space?.id ?? ""));
  const ask = async () => {
    if (!space) return;
    const count = (await listEntities(db, { spaceId: space.id })).length;
    menu.confirm({
      title: `Delete "${space.name}"?`,
      description:
        "This permanently deletes the Space and everything in it, across all its modules. This cannot be undone; nothing goes to Trash.",
      stats: [{ value: count, label: count === 1 ? "Item" : "Items" }],
      phrase: space.name,
      actions: [
        {
          label: "Delete Space",
          destructive: true,
          onPress: () =>
            destroy.mutate(undefined, {
              onSuccess: () => router.canDismiss() && router.dismissAll(),
            }),
        },
      ],
    });
  };
  return { ask, destroy };
}
