import { IconStack2 } from "@tabler/icons-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import type { SavedView, ViewModule } from "#/lib/api/views.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { Button } from "@nookly/ui/components/button";
import { ViewDialog } from "./ViewDialog";
import { serializeViewConfig } from "./view-config";

/// Linear's view controls, beside the filter menu: on a View with edits, Discard and
/// Save; on the plain page with filters applied, Save as view.
export function ViewActions<D>({
  spaceId,
  module,
  view,
  dirty,
  save,
  onDiscard,
  filters,
  display,
}: {
  spaceId: string;
  module: ViewModule;
  view: SavedView | undefined;
  dirty: boolean;
  save: UseMutationResult<SavedView, Error, void>;
  onDiscard: () => void;
  filters: ActiveFilter[];
  display: D;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const status = useActionStatus(save);

  if (view) {
    if (!dirty && status === "idle") return null;
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="secondary"
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
        {dirty && (
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        )}
      </div>
    );
  }

  if (filters.length === 0) return null;
  return (
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
        module={module}
        config={serializeViewConfig(filters, display)}
        onSaved={(created) =>
          useNavStore.getState().setView({ kind: "module", spaceId, module, viewId: created.id })
        }
      />
    </>
  );
}
