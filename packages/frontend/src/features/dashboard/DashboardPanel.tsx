import type { Icon as TablerIcon } from "@tabler/icons-react";
import { createContext, type CSSProperties, type ReactNode, useContext } from "react";
import { Button } from "@nookly/ui/components/button";
import {
  PageTabs,
  PageTabsBar,
  PageTabsList,
  PageTabsTrigger,
} from "@nookly/ui/components/page-tabs";
import { useQuery } from "@tanstack/react-query";
import { EntityKeyCopyInline } from "#/components/entity-key.tsx";
import { listSpaces } from "#/lib/api/spaces.ts";
import { qk } from "#/lib/query-keys.ts";
import { LIST_LIMIT, ROW_HEIGHT } from "./dashboard-model";
import { type ContextTargetProps } from "#/components/context-menu/registry.ts";

/// Every Space by id, to tag each resource with the one it lives in.
export function useSpaceById() {
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  return new Map(spaces.map((space) => [space.id, space]));
}

/// How many rows the list panels show right now: `LIST_LIMIT`, fewer while the window is too
/// short for the page to fit (see `DashboardWidgets`).
const ListLimitContext = createContext(LIST_LIMIT);
export const ListLimitProvider = ListLimitContext.Provider;
export function useListLimit(): number {
  return useContext(ListLimitContext);
}

/// A whole clickable row with its copyable ID, a primary label and trailing meta.
export function Row({
  entityKey,
  icon,
  children,
  meta,
  onClick,
  ...rest
}: {
  entityKey: string;
  icon: ReactNode;
  children: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
} & Partial<ContextTargetProps>) {
  return (
    <div className="flex h-7 min-w-0 items-center gap-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5">
      <EntityKeyCopyInline entityKey={entityKey} className="ml-1" />
      <button
        type="button"
        onClick={onClick}
        {...rest}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 pr-2 text-left text-sm"
      >
        <span className="flex shrink-0 text-muted-foreground">{icon}</span>
        <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
        {meta && (
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {meta}
          </span>
        )}
      </button>
    </div>
  );
}

/// An empty list reads as one quiet row in the list's own rhythm.
export function EmptyRow({ icon: Icon, children }: { icon: TablerIcon; children: ReactNode }) {
  return (
    <p className="flex h-7 items-center gap-2 px-2 text-sm text-muted-foreground">
      <Icon size={14} className="shrink-0" />
      {children}
    </p>
  );
}

/// Shown under a truncated list; leads to the full one, narrowed like the list.
export function ShowMore({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <Button variant="muted" size="sm" className="h-7 self-start px-2" onClick={onClick}>
      Show {count} more
    </Button>
  );
}

/// The rows of a list and its "Show more", kept one row taller than the rows shown so
/// switching tabs never moves what is below.
export function RowList({ children }: { children: ReactNode }) {
  const limit = useListLimit();
  return (
    <div
      className="flex min-h-(--list-height) flex-col"
      // SAFETY: a pixel length worked out from the row count, which `CSSProperties` can't name.
      style={{ "--list-height": `${(limit + 1) * ROW_HEIGHT}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

export interface TabDef<Id extends string> {
  id: Id;
  label: string;
  count: number;
}

/// A panel with a row of tabs under its heading.
export function TabbedPanel<Id extends string>({
  icon: Icon,
  title,
  tabs,
  tab,
  onTabChange,
  children,
}: {
  icon: TablerIcon;
  title: string;
  tabs: TabDef<Id>[];
  tab: Id;
  onTabChange: (tab: Id) => void;
  children: ReactNode;
}) {
  const ids = tabs.map((t) => t.id);
  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2" aria-label={title}>
      <PageTabs
        value={tab}
        onValueChange={(v) => onTabChange(ids.find((id) => id === v) ?? tab)}
        className="gap-2"
      >
        <PageTabsBar>
          <h2 className="mr-2 flex shrink-0 items-center gap-2 text-sm font-medium">
            <Icon size={14} className="text-muted-foreground" />
            {title}
          </h2>
          <PageTabsList>
            {tabs.map((t) => (
              <PageTabsTrigger key={t.id} value={t.id}>
                {t.label}
                <span className="font-normal text-muted-foreground tabular-nums">{t.count}</span>
              </PageTabsTrigger>
            ))}
          </PageTabsList>
        </PageTabsBar>
      </PageTabs>
      {children}
    </section>
  );
}
