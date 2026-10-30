import * as React from "react";
import { SearchIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "motion/react";

import { cn } from "@nookly/ui/lib/utils";

export type ScrollProgressSection = {
  id: string;
  label: string;
  /// Nesting depth (a markdown heading's level, say) — sections at a deeper
  /// level than the shallowest one present indent under it in the open list.
  level?: number;
};

/// Indentation step per level, relative to the shallowest level among
/// `sections` (so a document whose headings start at level 2 isn't indented
/// from the very first one).
const INDENT_STEP_PX = 14;

/// Open list height cap. Past it the list scrolls vertically. Applied to the
/// hidden measuring copy so the surface animates to the capped height.
const LIST_MAX_HEIGHT = "max-h-[min(24rem,60vh)]";

/// The sections whose label contains `query`, ignoring case, in their order. A blank query
/// keeps every section.
export function filterSections(sections: ScrollProgressSection[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;
  return sections.filter((s) => s.label.toLowerCase().includes(needle));
}

/// `label` cut into runs, the ones that match `query` (ignoring case) flagged, so the match
/// can be marked in the row.
export function splitMatch(label: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text: label, match: false }];
  const lower = label.toLowerCase();
  const runs: { text: string; match: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) runs.push({ text: label.slice(from, at), match: false });
    runs.push({ text: label.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < label.length) runs.push({ text: label.slice(from), match: false });
  return runs;
}

function indentPx(level: number | undefined, minLevel: number): number {
  return Math.max(0, (level ?? minLevel) - minLevel) * INDENT_STEP_PX;
}

const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const SIZE_SPRING = { type: "spring", bounce: 0.16, duration: 0.5 } as const;
const LABEL_CROSSFADE = { duration: 0.22, ease: EASE_OUT } as const;
const LAYER_FADE = { duration: 0.24, ease: EASE_IN_OUT } as const;

const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

type Size = { width: number; height: number };

export type ScrollProgressSearchProps = React.ComponentProps<"div"> & {
  sections?: ScrollProgressSection[];
  containerRef?: React.RefObject<HTMLElement | null>;
  offset?: number;
  /// The search field only shows from this many sections on; a short list needs no search.
  searchFrom?: number;
};

/// `ScrollProgress` whose open list also has a search field to find a section by typing.
const ScrollProgressSearch = ({
  className,
  sections = [],
  containerRef,
  offset = 120,
  searchFrom = 6,
  ...props
}: ScrollProgressSearchProps) => {
  const layoutId = React.useId();
  const reduceMotion = useReducedMotion();
  // Staggered blur-in shared by each row's dot and label.
  const itemEntrance = (i: number) => ({
    initial: reduceMotion ? undefined : { opacity: 0, y: 4, filter: "blur(3px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: {
      duration: 0.3,
      ease: EASE_IN_OUT,
      delay: reduceMotion ? 0 : 0.04 + i * 0.03,
    },
  });

  const { scrollYProgress } = useScroll(containerRef ? { container: containerRef } : undefined);
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });

  const [activeId, setActiveId] = React.useState(sections[0]?.id);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  /// The row Enter jumps to, as an index into the filtered sections.
  const [cursor, setCursor] = React.useState(0);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const searchable = sections.length >= searchFrom;
  const listId = React.useId();
  const shown = filterSections(sections, query);
  const cursorId = shown[cursor]?.id;

  const scrollLock = React.useRef(false);
  const scrollLockTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  React.useEffect(() => {
    const scroller = containerRef?.current ?? window;

    const update = () => {
      if (scrollLock.current) return;
      const anchor = (containerRef?.current?.getBoundingClientRect().top ?? 0) + offset;
      const active = sections.findLast(({ id }) => {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        return top !== undefined && top <= anchor;
      });
      setActiveId(active?.id ?? sections[0]?.id);
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections, containerRef, offset]);

  const label = sections.find((s) => s.id === activeId)?.label;
  const minLevel = sections.length > 0 ? Math.min(...sections.map((s) => s.level ?? 1)) : 1;

  const labelVersion = React.useRef(0);
  const prevLabel = React.useRef(label);
  if (label !== prevLabel.current) {
    prevLabel.current = label;
    labelVersion.current += 1;
  }

  const collapsedRef = React.useRef<HTMLDivElement>(null);
  const openRef = React.useRef<HTMLDivElement>(null);
  const labelRef = React.useRef<HTMLSpanElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const cursorRowRef = React.useRef<HTMLButtonElement>(null);

  const [collapsedSize, setCollapsedSize] = React.useState<Size>();
  const [openSize, setOpenSize] = React.useState<Size>();
  const [labelWidth, setLabelWidth] = React.useState<number>();

  useIsoLayoutEffect(() => {
    const measure = () => {
      if (labelRef.current) setLabelWidth(labelRef.current.offsetWidth);
      if (collapsedRef.current) {
        setCollapsedSize({
          width: collapsedRef.current.offsetWidth,
          height: collapsedRef.current.offsetHeight,
        });
      }
      if (openRef.current) {
        setOpenSize({
          width: openRef.current.offsetWidth,
          height: openRef.current.offsetHeight,
        });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (labelRef.current) ro.observe(labelRef.current);
    if (collapsedRef.current) ro.observe(collapsedRef.current);
    if (openRef.current) ro.observe(openRef.current);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [sections]);

  React.useEffect(() => {
    if (open) {
      searchRef.current?.focus({ preventScroll: true });
    } else {
      setQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    cursorRowRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [cursorId]);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(() => () => clearTimeout(scrollLockTimer.current), []);

  const selectSection = (id: string) => {
    scrollLock.current = true;
    clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = setTimeout(
      () => {
        scrollLock.current = false;
      },
      reduceMotion ? 0 : 700,
    );

    setActiveId(id);
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const openList = () => {
    setCursor(
      Math.max(
        0,
        sections.findIndex((s) => s.id === activeId),
      ),
    );
    setOpen(true);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => Math.min(Math.max(0, shown.length - 1), Math.max(0, c + step)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cursorId) selectSection(cursorId);
    } else if (e.key === "Escape" && query) {
      // The first Escape only clears the query; the next one closes the list.
      e.preventDefault();
      e.stopPropagation();
      setQuery("");
      setCursor(0);
    }
  };

  // The box is sized by the full list, never the filtered one: it keeps its width and
  // height while the query narrows the rows, so nothing jumps under the cursor.
  const size = open ? openSize : collapsedSize;
  const radius = open ? 26 : (collapsedSize?.height ?? 32) / 2;
  const squircle = "[corner-shape:squircle]";

  return (
    <div
      ref={rootRef}
      data-slot="scroll-progress-search"
      className={cn("fixed bottom-6 left-1/2 z-50 -translate-x-1/2", className)}
      {...props}
    >
      <div className="pointer-events-none invisible absolute" aria-hidden>
        <div ref={collapsedRef} className="inline-flex items-center gap-2.5 py-1.5 pl-2 pr-4">
          <span className="size-5" />
          <span ref={labelRef} className="whitespace-nowrap text-sm font-medium leading-none">
            {label}
          </span>
        </div>
        <div ref={openRef} className={cn("w-max overflow-hidden p-1.5", LIST_MAX_HEIGHT)}>
          {searchable && <div className="mb-1 h-8 min-w-48" />}
          {sections.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 py-2 pr-3 text-sm font-medium leading-none"
              style={{ paddingLeft: 12 + indentPx(s.level, minLevel) }}
            >
              <span className="size-1.5" />
              <span className="whitespace-nowrap">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {size && (
        <motion.div
          data-slot="scroll-progress-surface"
          className={cn(
            "absolute bottom-0 left-1/2 -translate-x-1/2 overflow-hidden border border-border bg-popover/75 text-popover-foreground shadow-lg backdrop-blur-md",
            squircle,
          )}
          initial={false}
          animate={{
            width: size.width,
            height: size.height,
            borderRadius: radius,
          }}
          transition={reduceMotion ? { duration: 0 } : SIZE_SPRING}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {open ? (
              <motion.div
                key="list"
                className="absolute inset-0 flex flex-col p-1.5"
                initial={{
                  opacity: 0,
                  filter: reduceMotion ? undefined : "blur(4px)",
                }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{
                  opacity: 0,
                  filter: reduceMotion ? undefined : "blur(4px)",
                }}
                transition={LAYER_FADE}
              >
                {searchable && (
                  <div className="relative mb-1 shrink-0">
                    <SearchIcon
                      className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      ref={searchRef}
                      type="text"
                      role="combobox"
                      aria-label="Search sections"
                      aria-expanded={shown.length > 0}
                      aria-controls={listId}
                      aria-activedescendant={cursorId ? `${listId}-${cursorId}` : undefined}
                      aria-autocomplete="list"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Search sections"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setCursor(0);
                      }}
                      onKeyDown={onSearchKeyDown}
                      className="h-8 w-full rounded-[14px] border border-input bg-accent/60 pr-3 pl-8 text-sm leading-none outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}
                {shown.length === 0 && (
                  <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
                    No matching headings
                  </p>
                )}
                <ul
                  id={listId}
                  role="listbox"
                  aria-label="Sections"
                  hidden={shown.length === 0}
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
                >
                  {shown.map((s, i) => {
                    const isActive = s.id === activeId;
                    const isCursor = s.id === cursorId;
                    return (
                      <li key={s.id} role="presentation" className="shrink-0">
                        <button
                          ref={isCursor ? cursorRowRef : undefined}
                          id={`${listId}-${s.id}`}
                          type="button"
                          role="option"
                          aria-selected={isCursor}
                          tabIndex={searchable ? -1 : 0}
                          onClick={() => selectSection(s.id)}
                          className={cn(
                            "relative flex w-full items-center gap-3 rounded-[14px] py-2 pr-3 text-left text-sm font-medium leading-none transition-colors",
                            squircle,
                            isCursor && query && "bg-accent/40",
                            isActive
                              ? "text-accent-foreground"
                              : "text-muted-foreground hover:text-popover-foreground",
                          )}
                          style={{
                            paddingLeft: 12 + indentPx(s.level, minLevel),
                          }}
                        >
                          {isActive && (
                            <motion.span
                              layoutId={`${layoutId}-active`}
                              className={cn(
                                "absolute inset-0 rounded-[14px] bg-accent/70",
                                squircle,
                              )}
                              transition={reduceMotion ? { duration: 0 } : SIZE_SPRING}
                            />
                          )}
                          <motion.span
                            className={cn(
                              "relative size-1.5 shrink-0 rounded-full",
                              isActive ? "bg-primary" : "bg-muted-foreground/50",
                            )}
                            {...itemEntrance(i)}
                          />
                          <motion.span className="relative whitespace-nowrap" {...itemEntrance(i)}>
                            {splitMatch(s.label, query).map((run, at) =>
                              run.match ? (
                                <mark
                                  key={at}
                                  className="rounded-[3px] bg-primary/25 text-popover-foreground"
                                >
                                  {run.text}
                                </mark>
                              ) : (
                                <React.Fragment key={at}>{run.text}</React.Fragment>
                              ),
                            )}
                          </motion.span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            ) : (
              <motion.button
                key="pill"
                type="button"
                onClick={openList}
                aria-label="Show sections"
                className="absolute inset-0 flex items-center gap-2.5 py-1.5 pl-2 pr-4"
                initial={{
                  opacity: 0,
                  filter: reduceMotion ? undefined : "blur(4px)",
                }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{
                  opacity: 0,
                  filter: reduceMotion ? undefined : "blur(4px)",
                }}
                transition={LAYER_FADE}
              >
                <span className="shrink-0">
                  <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      strokeWidth="2.5"
                      className="stroke-border"
                    />
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="stroke-primary"
                      style={{ pathLength: progress }}
                    />
                  </svg>
                </span>

                <span className="relative h-5 shrink-0" style={{ width: labelWidth }}>
                  <AnimatePresence initial={false}>
                    {label && (
                      <motion.span
                        key={labelVersion.current}
                        data-slot="scroll-progress-label"
                        className="absolute inset-y-0 left-0 flex items-center whitespace-nowrap text-sm font-medium leading-none text-popover-foreground"
                        initial={
                          reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(1.5px)" }
                        }
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(1.5px)" }}
                        transition={LABEL_CROSSFADE}
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export { ScrollProgressSearch };
export default ScrollProgressSearch;
