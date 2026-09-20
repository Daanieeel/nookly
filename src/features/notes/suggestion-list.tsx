import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

export interface SuggestionListItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/// Shared popup body for both the "/" block-type menu and the "@" mention menu
/// (§ notes rewrite) — the query itself is typed straight into the document, so
/// this only needs to render+navigate the filtered results, not host its own input.
export const SuggestionList = forwardRef<
  SuggestionListHandle,
  { items: SuggestionListItem[]; onSelect: (index: number) => void }
>(function SuggestionList({ items, onSelect }, ref) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        onSelect(selected);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="w-64 rounded-lg border border-border bg-popover p-2 text-xs text-muted-foreground shadow-lg">
        No results
      </div>
    );
  }

  return (
    <div className="flex w-64 flex-col gap-0.5 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(index)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
            index === selected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {item.icon}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{item.label}</span>
            {item.description && (
              <span className="truncate text-xs text-muted-foreground">{item.description}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});
