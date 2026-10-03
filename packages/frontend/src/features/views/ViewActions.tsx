import { IconStack2 } from "@tabler/icons-react";
import { useState } from "react";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import type { SavedView, ViewModule } from "#/lib/api/views.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { Button } from "@nookly/ui/components/button";
import { ViewDialog } from "./ViewDialog";
import { serializeViewConfig } from "./view-config";
import { viewTarget } from "./view-target";

/// The part of a mutation the save bar reads, so any mutation without variables fits.
export interface SaveMutation {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
  mutate: () => void;
}

/// A bar floating at the bottom of the page while it has unsaved filters or display
/// options, with Discard and Save. On a saved View, Save updates it; on the plain
/// page, Save keeps them as what the page opens with, and "Save as view" makes a new
/// View of them instead. It lingers briefly after saving to confirm. Place it in a
/// `relative` page container.
export function ViewSaveBar<D>({
  view,
  dirty,
  save,
  onDiscard,
  spaceId,
  module,
  filters,
  display,
}: {
  view: SavedView | undefined;
  dirty: boolean;
  save: SaveMutation;
  onDiscard: () => void;
  /// Where "Save as view" saves, and the page's own module, filters and display.
  spaceId: string;
  module: ViewModule;
  filters: ActiveFilter[];
  display: D;
}) {
  const status = useActionStatus(save);
  const [dialogOpen, setDialogOpen] = useState(false);
  if (!dirty && status === "idle") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        role="region"
        aria-label="Unsaved changes"
        className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-popover py-1.5 pr-1.5 pl-3 shadow-lg"
      >
        <span className="text-sm text-muted-foreground">
          {dirty
            ? view
              ? "Unsaved changes to this view"
              : "Unsaved changes"
            : view
              ? "View saved"
              : "Saved"}
        </span>
        <div className="flex items-center gap-1">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={onDiscard}>
              Discard
            </Button>
          )}
          {dirty && !view && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <IconStack2 />
              Save as view
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
              label={view ? "Save view" : "Save"}
              successLabel="Saved"
              errorLabel="Couldn't save"
            />
          </Button>
        </div>
      </div>
      {!view && (
        <ViewDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          spaceId={spaceId}
          module={module}
          config={serializeViewConfig(filters, display)}
          onSaved={(created) =>
            useNavStore.getState().setView(viewTarget(module, spaceId, created.id))
          }
        />
      )}
    </div>
  );
}
