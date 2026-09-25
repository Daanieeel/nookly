import {
  IconArrowUpRight,
  IconChevronDown,
  IconChevronRight,
  IconFolderPlus,
  IconLayoutGridAdd,
  IconSettings,
  IconTag,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { appActions } from "#/components/context-menu/app-actions.tsx";
import { type MenuSubItem, registerActions } from "#/components/context-menu/registry.ts";
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

declare module "#/components/context-menu/registry.ts" {
  interface ContextTargets {
    /// The sidebar's own background, between and around its rows.
    sidebar: { createSpace: () => void };
    /// A Space's row. Its dialogs belong to the row, so the row passes them in.
    /// Deleting a Space is permanent, so it never gets a context menu action: a
    /// right-click must never lead to a hard delete.
    space: SpaceRowTarget;
    /// A module's row inside a Space.
    "space-module": { spaceId: string; module: ModuleKey };
  }
}

export interface SpaceRowTarget {
  space: Space;
  expanded: boolean;
  toggle: () => void;
  openSettings: () => void;
  openLabels: () => void;
}

/// Same rules as the row's own "+" picker: modules not added yet, passengers
/// (Semesters rides along with Courses) never offered on their own.
function useAddableModules({ space }: SpaceRowTarget): MenuSubItem[] | undefined {
  const { data: added } = useQuery({
    queryKey: ["space-modules", space.id],
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
    id: "toggle",
    group: "open",
    label: ({ expanded }) => (expanded ? "Collapse" : "Expand"),
    icon: ({ expanded }: SpaceRowTarget) => (expanded ? IconChevronDown : IconChevronRight),
    run: ({ toggle }) => toggle(),
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
    id: "settings",
    group: "edit",
    label: "Space Settings",
    icon: IconSettings,
    afterClose: true,
    run: ({ openSettings }) => openSettings(),
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
]);
