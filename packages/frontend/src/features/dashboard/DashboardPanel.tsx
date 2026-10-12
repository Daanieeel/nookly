import type { Icon as TablerIcon } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Button } from "@nookly/ui/components/button";
import {
  PageTabs,
  PageTabsBar,
  PageTabsList,
  PageTabsTrigger,
} from "@nookly/ui/components/page-tabs";
import { EntityKeyCopyInline } from "#/components/entity-key.tsx";
import { type ContextTargetProps } from "#/components/context-menu/registry.ts";
import { cn } from "@nookly/ui/lib/utils";

/// Rows a list panel shows before "Show more".
export const LIST_LIMIT = 5;

/// A flat Dashboard panel: a quiet heading with rows sitting directly on the page.
export function Panel({
  icon: Icon,
  title,
  action,
  className,
  children,
}: {
  icon: TablerIcon;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col gap-2", className)}>
      <header className="flex h-8 items-center gap-2">
        <Icon size={14} className="shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-medium">{title}</h2>
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  );
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

/// The rows of a list and its "Show more", kept `LIST_LIMIT` + 1 rows tall (h-7 each) so
/// switching tabs never moves what is below.
export function RowList({ children }: { children: ReactNode }) {
  return <div className="flex min-h-42 flex-col">{children}</div>;
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
