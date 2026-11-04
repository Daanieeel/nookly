import {
  IconArrowUpRight,
  IconColorSwatch,
  IconFolderPlus,
  IconLayoutGridAdd,
  IconMoodSmile,
  IconPencil,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { appActions } from "#/components/context-menu/app-actions.tsx";
import { type MenuSubItem, registerActions } from "#/components/context-menu/registry.ts";
import { isRemovableModule } from "#/components/sidebar/remove-module-dialog.tsx";
import { addSpaceModule, listSpaceModules } from "#/lib/api/spaces.ts";
import type { Space } from "#/lib/api/types.ts";
import {
  MODULE_ICONS,
  MODULE_KEYS,
  MODULE_LABELS,
  MODULE_PASSENGERS,
  type ModuleKey,
} from "#/lib/modules.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { qk } from "#/lib/query-keys.ts";

declare module "#/components/context-menu/registry.ts" {
  interface ContextTargets {
    /// The sidebar's own background, between and around its rows.
    sidebar: { createSpace: () => void };
    /// A Space's icon in the bottom row, or its name above the modules. Its dialogs belong
    /// to the sidebar, so it passes openers in. Delete only opens the confirmation, which
    /// makes the user type the Space's name, so a right click never deletes anything itself.
    space: SpaceRowTarget;
    /// A module's row inside a Space.
    "space-module": { spaceId: string; module: ModuleKey; removeModule: () => void };
  }
}

interface SpaceRowTarget {
  space: Space;
  openSettings: () => void;
  openLabels: () => void;
  openDelete: () => void;
}

/// Same rules as the row's own "+" picker: modules not added yet, passengers
/// (Semesters rides along with Courses) never offered on their own.
function useAddableModules({ space }: SpaceRowTarget): MenuSubItem[] | undefined {
  const { data: added } = useQuery({
    queryKey: qk.spaceModules(space.id),
    queryFn: () => listSpaceModules(space.id),
  });
  if (!added) return undefined;
  const passengers = new Set([...MODULE_PASSENGERS.values()].flat());
  return MODULE_KEYS.filter((key) => !added.includes(key) && !passengers.has(key)).map((key) => {
    const Icon = MODULE_ICONS[key];
    return {
      id: key,
      label: MODULE_LABELS[key],
      icon: <Icon size={14} className="text-muted-foreground" />,
      run: async (helpers) => {
        await addSpaceModule(space.id, key);
        for (const passenger of MODULE_PASSENGERS.get(key) ?? []) {
          await addSpaceModule(space.id, passenger);
        }
        useNavStore.getState().setView({ kind: "module", spaceId: space.id, module: key });
        await helpers.refresh();
      },
    };
  });
}

registerActions("sidebar", [
  {
    id: "new-space",
    group: "create",
    label: "New Space",
    icon: IconFolderPlus,
    afterClose: true,
    run: ({ createSpace }) => createSpace(),
  },
  ...appActions<{ createSpace: () => void }>(),
]);

registerActions("space", [
  {
    id: "rename",
    group: "edit",
    label: "Rename",
    icon: IconPencil,
    afterClose: true,
    run: ({ openSettings }) => openSettings(),
  },
  {
    id: "change-icon",
    group: "edit",
    label: "Change Icon",
    icon: IconMoodSmile,
    afterClose: true,
    run: ({ openSettings }) => openSettings(),
  },
  {
    id: "change-color",
    group: "edit",
    label: "Change Color",
    icon: IconColorSwatch,
    afterClose: true,
    run: ({ openSettings }) => openSettings(),
  },
  {
    id: "add-module",
    group: "create",
    label: "Add Module",
    icon: IconLayoutGridAdd,
    useItems: useAddableModules,
    emptyLabel: "Every module is added",
  },
  {
    id: "labels",
    group: "edit",
    label: "Labels",
    icon: IconTag,
    afterClose: true,
    run: ({ openLabels }) => openLabels(),
  },
  {
    id: "delete",
    group: "danger",
    label: "Delete Space",
    icon: IconTrash,
    destructive: true,
    afterClose: true,
    run: ({ openDelete }) => openDelete(),
  },
]);

registerActions("space-module", [
  {
    id: "open",
    group: "open",
    label: ({ module }) => `Open ${MODULE_LABELS[module]}`,
    icon: IconArrowUpRight,
    run: ({ spaceId, module }) =>
      useNavStore.getState().setView({ kind: "module", spaceId, module }),
  },
  {
    id: "remove",
    group: "danger",
    label: "Remove Module",
    icon: IconTrash,
    destructive: true,
    afterClose: true,
    when: ({ module }) => isRemovableModule(module),
    run: ({ removeModule }) => removeModule(),
  },
]);
