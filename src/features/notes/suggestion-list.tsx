import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SuggestionListItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  /// Heading the item is listed under. Items of one group must be adjacent;
  /// groups left empty by a search disappear with their heading.
  group?: string;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/// Shared popup body for the "/" block-type menu, the "@" mention menu, and the
/// block gutter's "+" menu (§ notes rewrite). The "/" and "@" queries are typed
/// straight into the document; `searchable` adds an in-popup input for callers
/// with no document text to filter by. `onSelect` always gets the index into
/// the full `items` list, so filtering stays invisible to the caller.
export const SuggestionList = forwardRef<
  SuggestionListHandle,
  {
    items: SuggestionListItem[];
    onSelect: (index: number) => void;
    searchable?: boolean;
    /// Inside a surface that already draws the card (a popover): no border,
    /// background or shadow of its own, and the host's width.
    embedded?: boolean;
  }
>(function SuggestionList({ items, onSelect, searchable = false, embedded = false }, ref) {
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchable) searchRef.current?.focus();
  }, [searchable]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items;
  }, [items, query]);

  useEffect(() => setSelected(0), [visible]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const select = (visibleIndex: number) => {
    const item = visible[visibleIndex];
    if (item) onSelect(items.indexOf(item));
  };

  const handleKey = (event: KeyboardEvent): boolean => {
    if (visible.length === 0) return false;
    if (event.key === "ArrowDown") {
      setSelected((i) => (i + 1) % visible.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      setSelected((i) => (i - 1 + visible.length) % visible.length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      select(selected);
      return true;
    }
    return false;
  };

  useImperativeHandle(ref, () => ({ onKeyDown: handleKey }));

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        !embedded &&
          "w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
      )}
    >
      {searchable && (
        <div className="border-b border-border p-1">
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // Hosts that route keys through `onKeyDown` (the gutter menu) stop
            // them before they get here; anywhere else the field drives the list.
            onKeyDown={(event) => {
              if (handleKey(event.nativeEvent)) event.preventDefault();
            }}
            placeholder="Search blocks"
            aria-label="Search blocks"
            className="h-7 text-xs"
          />
        </div>
      )}
      {visible.length === 0 ? (
        <div className="p-2 text-xs text-muted-foreground">No results</div>
      ) : (
        // Caps the list at 5.5 rows (the half row hints at more): a described row is
        // 3rem (`py-1.5` + `text-sm` label + `text-xs` line), 5 `gap-0.5` gaps, `p-1`.
        <div
          ref={listRef}
          className="flex max-h-[calc(5.5*3rem+5*0.125rem+0.5rem)] flex-col gap-0.5 overflow-y-auto p-1"
        >
          {visible.map((item, index) => (
            <Fragment key={item.key}>
              {item.group && item.group !== visible[index - 1]?.group && (
                <div
                  className={cn(
                    "shrink-0 px-2 pb-0.5 text-xs font-medium text-muted-foreground",
                    index > 0 ? "pt-2" : "pt-1",
                  )}
                >
                  {item.group}
                </div>
              )}
              <button
                data-index={index}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(index)}
                className={cn(
                  "flex w-full shrink-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
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
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
});
