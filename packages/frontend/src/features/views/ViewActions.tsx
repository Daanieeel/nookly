import { IconStack2 } from "@tabler/icons-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import type { SavedView, ViewModule } from "#/lib/api/views.ts";
import type { Space } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { Button } from "@nookly/ui/components/button";
import { ViewDialog } from "./ViewDialog";
import { viewTarget } from "./view-target";
import { serializeViewConfig } from "./view-config";

/// The View controls in the page header, beside the filter menu: on the plain page
/// with filters applied, Save as view. Edits to a saved View
/// are saved from `ViewSaveBar`.
export function ViewActions<D>({
  spaceId,
  module,
  view,
  filters,
  display,
  spaces,
}: {
  spaceId: string;
  module: ViewModule;
  view: SavedView | undefined;
  filters: ActiveFilter[];
  display: D;
  /// The Spaces a new View can be saved in; set on a cross-Space page, whose Views
  /// belong to a Space like any entity.
  spaces?: Space[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      {!view && filters.length > 0 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setDialogOpen(true)}
          >
            <IconStack2 />
            Save as view
          </Button>
          <ViewDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            spaceId={spaceId}
            spaces={spaces}
            module={module}
            config={serializeViewConfig(filters, display)}
            onSaved={(created) =>
              useNavStore.getState().setView(viewTarget(module, spaceId, created.id))
            }
          />
        </>
      )}
    </>
  );
}

/// A bar floating at the bottom of the page while a saved View has unsaved edits,
/// with Discard and Save. It lingers briefly after saving to confirm. Place it in a
/// `relative` page container.
export function ViewSaveBar({
  view,
  dirty,
  save,
  onDiscard,
}: {
  view: SavedView | undefined;
  dirty: boolean;
  save: UseMutationResult<SavedView, Error, void>;
  onDiscard: () => void;
}) {
  const status = useActionStatus(save);
  if (!view || (!dirty && status === "idle")) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        role="region"
        aria-label="Unsaved view changes"
        className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-popover py-1.5 pr-1.5 pl-3 shadow-lg"
      >
        <span className="text-sm text-muted-foreground">
          {dirty ? "Unsaved changes to this view" : "View saved"}
        </span>
        <div className="flex items-center gap-1">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={onDiscard}>
              Discard
            </Button>
          )}
          <Button
            variant="positive"
            size="sm"
            onClick={() => !save.isPending && save.mutate()}
            disabled={!dirty && status === "idle"}
          >
            <StatusButtonContent
              status={status}
              label="Save view"
              successLabel="Saved"
              errorLabel="Couldn't save"
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
