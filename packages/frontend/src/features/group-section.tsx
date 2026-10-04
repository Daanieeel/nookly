import { IconCaretDownFilled, IconCaretRightFilled } from "@tabler/icons-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  buildGroups,
  type GroupDef,
  isCollapsed,
  moveRowFocus,
  toggleId,
} from "#/components/grouped-view/grouping.ts";

/// A collapsible group with a sticky header, shared by the grouped card/row lists.
export function GroupSection({
  name,
  count,
  collapsed,
  onToggle,
  children,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={name}>
      <div className="sticky top-0 z-30 flex h-9 items-center border-b border-border bg-card px-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
        >
          {collapsed ? (
            <IconCaretRightFilled size={10} className="text-muted-foreground" />
          ) : (
            <IconCaretDownFilled size={10} className="text-muted-foreground" />
          )}
          <span className="truncate font-medium">{name}</span>
          <span className="text-muted-foreground tabular-nums">{count}</span>
        </button>
      </div>
      {!collapsed && children}
    </section>
  );
}

/// The scrolling body of the grouped card/row lists (Bookmarks, Files): the items as one
/// run without grouping, else one collapsible section per non-empty group. `renderItems`
/// is told whether it draws the first run, which is where anything pending goes.
export function GroupedList<T>({
  items,
  defs,
  allName,
  collapsed,
  setCollapsed,
  renderItems,
}: {
  items: T[];
  /// The groups, or null when the list isn't grouped.
  defs: GroupDef<T>[] | null;
  /// What the single ungrouped run is called.
  allName: string;
  collapsed: Set<string>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  renderItems: (items: T[], first: boolean) => ReactNode;
}) {
  const groups = buildGroups(
    items,
    defs ?? [{ id: "all", name: allName, match: () => true }],
    null,
  ).filter((g) => g.items.length > 0);
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
    <div className="min-h-0 flex-1 overflow-y-auto pb-24" onKeyDown={moveRowFocus}>
      {defs === null
        ? renderItems(items, true)
        : groups.map((group, i) => (
            <GroupSection
              key={group.id}
              name={group.name}
              count={group.items.length}
              collapsed={isCollapsed(collapsed, group.id, false)}
              onToggle={() => setCollapsed((prev) => toggleId(prev, group.id))}
            >
              {renderItems(group.items, i === 0)}
            </GroupSection>
          ))}
    </div>
  );
}
