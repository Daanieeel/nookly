import { type Icon as TablerIcon, IconPlus } from "@tabler/icons-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { type ActiveFilter, type FilterField, FilterMenu } from "#/components/filter-menu.tsx";
import { EditableViewTitle } from "#/features/views/EditableViewTitle.tsx";
import { ViewSaveBar } from "#/features/views/ViewActions.tsx";
import { ViewIconButton } from "#/features/views/ViewIconButton.tsx";
import type { SavedView, ViewModule } from "#/lib/api/views.ts";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";

/// The header of a list and board page (Tasks, Assignments and their cross-Space
/// overviews): the title (or the saved View's), the presets, filter and display
/// buttons and the create button, then the filter chips and the save bar.
/// `presets` and `displayMenu` are the page's own buttons. `viewMenu` makes the title
/// a context menu target for the saved View.
export function ModuleViewHeader<D>({
  icon: Icon,
  title,
  view,
  viewMenu,
  presets,
  displayMenu,
  create,
  filterFields,
  filters,
  onFiltersChange,
  dirty,
  save,
  onDiscard,
  spaceId,
  module,
  display,
}: {
  icon: TablerIcon;
  title: string;
  view: SavedView | undefined;
  viewMenu?: boolean;
  presets: ReactNode;
  displayMenu: ReactNode;
  create: { label: string; tooltip: string; onClick: () => void; disabled?: boolean };
  filterFields: FilterField[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  dirty: boolean;
  save: UseMutationResult<unknown, Error, void>;
  onDiscard: () => void;
  /// Where "Save as view" saves.
  spaceId: string;
  module: ViewModule;
  display: D;
}) {
  return (
    <>
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-border py-2 pr-2 pl-4">
        <div className="flex min-w-0 items-center gap-1">
          <h1
            className="flex h-8 items-center gap-2 text-sm font-medium"
            {...(viewMenu && view && entityTarget(view.entity))}
          >
            {view ? (
              <ViewIconButton entity={view.entity} />
            ) : (
              <Icon size={16} className="text-muted-foreground" />
            )}
            {view ? <EditableViewTitle entity={view.entity} /> : title}
          </h1>
          <div className="flex-1" />
          {presets}
          <FilterMenu
            fields={filterFields}
            filters={filters}
            onFiltersChange={onFiltersChange}
            part="button"
          />
          {displayMenu}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="ml-1 gap-1.5"
                disabled={create.disabled}
                onClick={create.onClick}
              >
                <IconPlus />
                {create.label}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              {create.tooltip} <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
        <FilterMenu
          fields={filterFields}
          filters={filters}
          onFiltersChange={onFiltersChange}
          part="chips"
        />
      </header>
      <ViewSaveBar
        view={view}
        dirty={dirty}
        save={save}
        onDiscard={onDiscard}
        spaceId={spaceId}
        module={module}
        filters={filters}
        display={display}
      />
    </>
  );
}

/// What a list or board page shows when its filters leave nothing; `onClear` adds a
/// "Clear filters" button.
export function NoMatchesNotice({ text, onClear }: { text: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
