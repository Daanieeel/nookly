import { type Icon as TablerIcon, IconFilterOff, IconPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { type ActiveFilter, type FilterField, FilterMenu } from "#/components/filter-menu.tsx";
import { EditableViewTitle } from "#/features/views/EditableViewTitle.tsx";
import { type SaveMutation, ViewSaveBar } from "#/features/views/ViewActions.tsx";
import { ViewIconButton } from "#/features/views/ViewIconButton.tsx";
import type { SavedView, ViewModule } from "#/lib/api/views.ts";
import { Button } from "@nookly/ui/components/button";
import { HEADER_ROW, PageHeaderActions } from "#/components/page-header.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { cn } from "@nookly/ui/lib/utils";
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
  toolbar,
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
  query,
}: {
  icon: TablerIcon;
  title: string;
  view: SavedView | undefined;
  viewMenu?: boolean;
  presets: ReactNode;
  /// A row of its own under the title row, for what does not fit beside the buttons (a
  /// search field and its shortcuts).
  toolbar?: ReactNode;
  displayMenu: ReactNode;
  create: { label: string; tooltip: string; onClick: () => void; disabled?: boolean };
  filterFields: FilterField[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  dirty: boolean;
  save: SaveMutation;
  onDiscard: () => void;
  /// Where "Save as view" saves.
  spaceId: string;
  module: ViewModule;
  display: D;
  /// The page's search text, for pages that have one.
  query?: string;
}) {
  return (
    <>
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-border py-2 pr-2 pl-4">
        <div className={cn(HEADER_ROW, "gap-x-1")}>
          <h1
            className="flex h-8 shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap"
            {...(viewMenu && view && entityTarget(view.entity))}
          >
            {view ? (
              <ViewIconButton entity={view.entity} />
            ) : (
              <Icon size={16} className="text-muted-foreground" />
            )}
            {view ? <EditableViewTitle entity={view.entity} /> : title}
          </h1>
          <PageHeaderActions>
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
                {create.tooltip} <ShortcutKbd name="create" />
              </TooltipContent>
            </Tooltip>
          </PageHeaderActions>
        </div>
        {toolbar ? <div className="flex flex-wrap items-center gap-2 pr-2">{toolbar}</div> : null}
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
        query={query}
      />
    </>
  );
}

/// What a list or board page shows when its filters leave nothing; `onClear` adds a
/// "Clear filters" button.
export function NoMatchesNotice({ text, onClear }: { text: string; onClear?: () => void }) {
  return (
    <div className="p-6">
      <EmptyState
        icon={IconFilterOff}
        title="No matches"
        description={text}
        action={onClear ? { label: "Clear filters", onClick: onClear } : undefined}
      />
    </div>
  );
}
