import { IconCalendarStats, IconChalkboard, IconClipboardList } from "@tabler/icons-react";
import {
  type EntityRecord,
  type MenuAction,
  registerEntityType,
  type EntityTarget,
} from "#/components/context-menu/registry.ts";
import type { ModuleKey } from "#/lib/modules.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// A Course's own views of what belongs to it: that module, filtered to it.
function courseView(
  module: ModuleKey,
  label: string,
  icon: MenuAction<EntityTarget>["icon"],
): MenuAction<EntityTarget> {
  return {
    id: `view-${module}`,
    group: "open",
    label,
    icon,
    run: ({ entity }) =>
      useNavStore
        .getState()
        .setView({ kind: "module", spaceId: entity.spaceId, module, filterCourseId: entity.id }),
  };
}

registerEntityType<EntityRecord>({
  types: ["course"],
  actions: [
    courseView("sessions", "View Sessions", IconChalkboard),
    courseView("exams", "View Exams", IconCalendarStats),
    courseView("assignments", "View Assignments", IconClipboardList),
  ],
});
