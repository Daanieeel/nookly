import type { Icon as TablerIcon } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// The classes of a row in a page header. A page can be a few hundred pixels wide when it
/// is one side of a split view, so a row wraps onto a second line instead of squeezing.
export const HEADER_ROW = "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1";

/// The bar at the top of a module page: the title, then the page's actions on the right.
export function PageHeader({ children }: { children: ReactNode }) {
  return (
    <header className={cn(HEADER_ROW, "min-h-12 shrink-0 border-b border-border py-2 pr-2 pl-4")}>
      {children}
    </header>
  );
}

/// A page's title with its icon. It stays on one line.
export function PageHeaderTitle({
  icon: Icon,
  children,
}: {
  icon: TablerIcon;
  children: ReactNode;
}) {
  return (
    <h1 className="flex shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap">
      <Icon size={16} className="text-muted-foreground" />
      {children}
    </h1>
  );
}

/// The buttons at the right of a header. They take what is left of the row, and drop to a
/// line of their own when there is little of it.
export function PageHeaderActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 basis-72 flex-wrap items-center justify-end gap-1">
      {children}
    </div>
  );
}
