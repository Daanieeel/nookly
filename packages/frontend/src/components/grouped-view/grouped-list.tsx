import { IconCaretDownFilled, IconCaretRightFilled, IconPlus } from "@tabler/icons-react";
import { Fragment, type ReactNode, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { type ViewGroup, isCollapsed, moveRowFocus, toggleId } from "./grouping";

/// Dense Linear style list: sticky group headers with a count, sub-group headers
/// nested under them, then the rows. Empty sub-groups are left out.
export function GroupedList<T>({
  groups,
  showHeaders,
  getKey,
  renderRow,
  onCreateIn,
  createLabel,
  footer,
}: {
  groups: ViewGroup<T>[];
  showHeaders: boolean;
  getKey: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  /// Unset, or returning nothing, for groups a new item can't be placed in.
  onCreateIn?: (group: ViewGroup<T>, subgroup: ViewGroup<T> | null) => (() => void) | undefined;
  /// Names the create button, like `New Task in Todo`.
  createLabel?: (name: string) => string;
  /// Pinned below the rows at the bottom of the page, like column labels.
  footer?: ReactNode;
}) {
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setToggled((prev) => toggleId(prev, id));
  const rows = (items: T[]) =>
    items.map((item) => <Fragment key={getKey(item)}>{renderRow(item)}</Fragment>);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6" onKeyDown={moveRowFocus}>
        {groups.map((group) => {
          const collapsed = isCollapsed(toggled, group.id, group.defaultCollapsed);
          return (
            <section key={group.id} aria-label={group.name}>
              {showHeaders && (
                <GroupHeader
                  group={group}
                  count={group.items.length}
                  collapsed={collapsed}
                  onToggle={() => toggle(group.id)}
                  onCreate={onCreateIn?.(group, null)}
                  createLabel={createLabel}
                />
              )}
              {!collapsed &&
                (group.subgroups
                  ? group.subgroups
                      .filter((sub) => sub.items.length > 0)
                      .map((sub) => {
                        const id = `${group.id}/${sub.id}`;
                        const subCollapsed = isCollapsed(toggled, id, sub.defaultCollapsed);
                        return (
                          <section key={sub.id} aria-label={`${group.name}, ${sub.name}`}>
                            <GroupHeader
                              group={sub}
                              count={sub.items.length}
                              collapsed={subCollapsed}
                              onToggle={() => toggle(id)}
                              onCreate={onCreateIn?.(group, sub)}
                              createLabel={createLabel}
                              nested
                            />
                            {!subCollapsed && rows(sub.items)}
                          </section>
                        );
                      })
                  : rows(group.items))}
            </section>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

function GroupHeader<T>({
  group,
  count,
  collapsed,
  onToggle,
  onCreate,
  createLabel,
  nested = false,
}: {
  group: ViewGroup<T>;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onCreate: (() => void) | undefined;
  createLabel?: (name: string) => string;
  nested?: boolean;
}) {
  const label = createLabel?.(group.name) ?? `New in ${group.name}`;
  return (
    <div className={cn(!nested && "sticky top-0 z-10 bg-card")}>
      <div
        className={cn(
          "group/header flex items-center gap-2 border-b px-2",
          nested ? "h-8 border-border/60 pl-6" : "h-9 border-border bg-foreground/4",
        )}
      >
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className={cn(
            "flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-accent/60",
            nested ? "text-xs" : "text-sm",
          )}
        >
          {collapsed ? (
            <IconCaretRightFilled size={10} className="text-muted-foreground" />
          ) : (
            <IconCaretDownFilled size={10} className="text-muted-foreground" />
          )}
          {group.icon}
          <span className="truncate font-medium">{group.name}</span>
          <span className="text-muted-foreground tabular-nums">{count}</span>
        </button>
        {onCreate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                onClick={onCreate}
                className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/header:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
              >
                <IconPlus size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
