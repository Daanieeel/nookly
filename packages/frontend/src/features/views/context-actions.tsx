import { IconPencil } from "@tabler/icons-react";
import { registerEntityType } from "#/components/context-menu/registry.ts";
import { ViewDialog } from "./ViewDialog";

// A View's filter values (statuses, Courses, labels) belong to its Space, so it
// can't be moved, and it links to nothing.
registerEntityType({
  types: ["view"],
  omit: ["relate", "move"],
  actions: [
    {
      id: "rename",
      group: "edit",
      label: "Rename or change icon",
      icon: IconPencil,
      run: ({ entity }, helpers) =>
        helpers.openDialog((close) => (
          <ViewDialog
            open
            onOpenChange={(open) => !open && close()}
            spaceId={entity.spaceId}
            existing={entity}
          />
        )),
    },
  ],
});
