import { IconTopologyStar3 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { SpaceChip } from "#/components/space-chip.tsx";
import { Label } from "@nookly/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@nookly/ui/components/sheet";
import { Switch } from "@nookly/ui/components/switch";
import { getEntity } from "#/lib/api/entities.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { armNewTabIntent, useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { layoutGraph, type Point } from "./graph-layout.ts";
import { fitZoom, stepZoom, wheelZoom } from "./graph-zoom.ts";
import { GraphZoomControls } from "./GraphZoomControls.tsx";
import {
  GRAPH_RING_CAP,
  type GraphEdge,
  type RelationshipGraph,
  useRelationshipGraph,
} from "./relationship-graph.ts";

/// With this many edges or fewer every edge says how it relates; beyond that only the
/// edges of the item being pointed at do, so labels never pile up.
const LABEL_ALL_UP_TO = 12;

/// An item's connections as a graph in a side panel: the item in the middle, its direct
/// links around it and, on request, the links of those on a second ring.
export function RelationshipGraphPanel({
  entity,
  open,
  onOpenChange,
}: {
  entity: Entity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-3xl">
        <div className="border-b border-border pr-8">
          <SheetHeader>
            <SheetTitle>Relationship graph</SheetTitle>
            <SheetDescription>{displayTitle(entity)} and the items it links to</SheetDescription>
          </SheetHeader>
        </div>
        <GraphBody entity={entity} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function GraphBody({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  const [secondRing, setSecondRing] = useState(false);
  const switchId = useId();
  const { graph, isLoading, isError } = useRelationshipGraph(entity.id, secondRing ? 2 : 1);
  const empty = graph.nodes.length <= 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Switch id={switchId} checked={secondRing} onCheckedChange={setSecondRing} />
        <Label htmlFor={switchId}>Second ring</Label>
        <TruncationNotice truncated={graph.truncated} />
      </div>
      {isError ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          Couldn't load relationships, try again
        </p>
      ) : isLoading ? (
        <div className="m-4 h-40 rounded-lg bg-accent/40 motion-safe:animate-pulse" />
      ) : empty ? (
        <EmptyState
          className="m-4"
          icon={IconTopologyStar3}
          title="No relationships yet"
          description="Link this item to others from Relationships in the sidebar and they show up here."
        />
      ) : (
        <GraphCanvas entity={entity} graph={graph} onClose={onClose} />
      )}
    </div>
  );
}

/// Tells that a ring was cut at the cap, and by how many.
function TruncationNotice({ truncated }: { truncated: RelationshipGraph["truncated"] }) {
  const parts = [
    truncated.ring1 > 0 && `${truncated.ring1} more direct links`,
    truncated.ring2 > 0 && `${truncated.ring2} more in the second ring`,
  ].filter((part): part is string => part !== false);
  return (
    <p role="status" className="ml-auto text-xs text-muted-foreground">
      {parts.length > 0 &&
        `Showing the first ${GRAPH_RING_CAP} of each ring, ${parts.join(" and ")} not shown`}
    </p>
  );
}

function GraphCanvas({
  entity,
  graph,
  onClose,
}: {
  entity: Entity;
  graph: RelationshipGraph;
  onClose: () => void;
}) {
  const layout = layoutGraph(graph);
  const [active, setActive] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  // The spot of the canvas (0 to 1 across and down) to keep in the middle of the view while zooming.
  const focus = useRef<Point | null>(null);

  const zoomTo = useCallback(
    (next: number) => {
      const el = scroller.current;
      if (el) {
        const box = layout.size * zoomRef.current;
        focus.current = {
          x: (el.scrollLeft + el.clientWidth / 2) / box,
          y: (el.scrollTop + el.clientHeight / 2) / box,
        };
      }
      zoomRef.current = next;
      setZoom(next);
    },
    [layout.size],
  );
  const fit = useCallback(() => {
    const el = scroller.current;
    zoomTo(fitZoom(layout.size, el?.clientWidth ?? 0, el?.clientHeight ?? 0));
  }, [layout.size, zoomTo]);

  // A graph that grew, like with the second ring, starts zoomed so all of it shows.
  useLayoutEffect(() => {
    const el = scroller.current;
    const next = fitZoom(layout.size, el?.clientWidth ?? 0, el?.clientHeight ?? 0);
    zoomRef.current = next;
    setZoom(next);
  }, [layout.size]);

  // Keep the item in view at the start and the same spot in view while zooming.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const at = focus.current ?? { x: 0.5, y: 0.5 };
    focus.current = null;
    el.scrollLeft = at.x * layout.size * zoom - el.clientWidth / 2;
    el.scrollTop = at.y * layout.size * zoom - el.clientHeight / 2;
  }, [layout.size, zoom]);

  // Ctrl or Cmd with the wheel, which is also how a trackpad pinch arrives, zooms. It needs a
  // listener that is not passive, so the page itself doesn't zoom as well.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomTo(wheelZoom(zoomRef.current, event.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const showAllLabels = graph.edges.length <= LABEL_ALL_UP_TO;
  const others = graph.nodes.filter((n) => n.ring > 0);
  const center = layout.positions.get(entity.id);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        className="size-full overflow-auto"
        // The panel's scroll lock cancels a whole wheel event when its main direction cannot
        // scroll, which breaks a diagonal trackpad swipe. This area scrolls itself.
        onWheel={(event) => event.stopPropagation()}
      >
        <div
          className="relative m-auto size-(--graph-box)"
          // SAFETY: `--graph-box` only ever receives the zoomed pixel size.
          style={{ "--graph-box": `${layout.size * zoom}px` } as CSSProperties}
        >
          <div
            className="absolute top-0 left-0 size-(--graph-size) origin-top-left scale-(--graph-zoom)"
            // SAFETY: `--graph-size` and `--graph-zoom` only ever receive the layout's pixel size and a number.
            style={{ "--graph-size": `${layout.size}px`, "--graph-zoom": zoom } as CSSProperties}
          >
            <svg
              aria-hidden="true"
              width={layout.size}
              height={layout.size}
              className="absolute inset-0 text-border"
            >
              {graph.edges.map((edge) => {
                const a = layout.positions.get(edge.from);
                const b = layout.positions.get(edge.to);
                if (!a || !b) return null;
                const lit = active === edge.from || active === edge.to;
                return (
                  <line
                    key={`${edge.from}|${edge.to}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="currentColor"
                    strokeWidth={lit ? 2 : 1}
                    className={cn("motion-safe:transition-colors", lit && "text-muted-foreground")}
                  />
                );
              })}
            </svg>
            {graph.edges.map((edge) => {
              const a = layout.positions.get(edge.from);
              const b = layout.positions.get(edge.to);
              const lit = active === edge.from || active === edge.to;
              if (!a || !b || !(showAllLabels || lit)) return null;
              return <EdgeLabel key={`${edge.from}|${edge.to}`} edge={edge} from={a} to={b} />;
            })}
            {center && (
              <div
                className="absolute top-(--y) left-(--x) flex w-28 -translate-1/2 items-center justify-center gap-1.5 rounded-md border border-primary/60 bg-accent px-2 py-1.5 text-xs font-medium"
                // SAFETY: `--x` and `--y` only ever receive pixel coordinates from the layout.
                style={{ "--x": `${center.x}px`, "--y": `${center.y}px` } as CSSProperties}
              >
                <EntityIcon entity={entity} size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{displayTitle(entity)}</span>
              </div>
            )}
            <ul aria-label="Related items">
              {others.map((node) => {
                const point = layout.positions.get(node.id);
                if (!point) return null;
                return (
                  <li
                    key={node.id}
                    className="absolute top-(--y) left-(--x) -translate-1/2"
                    // SAFETY: `--x` and `--y` only ever receive pixel coordinates from the layout.
                    style={{ "--x": `${point.x}px`, "--y": `${point.y}px` } as CSSProperties}
                    onMouseEnter={() => setActive(node.id)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(node.id)}
                    onBlur={() => setActive(null)}
                  >
                    <GraphNodeButton
                      entityId={node.id}
                      currentSpaceId={entity.spaceId}
                      labels={labelsOf(graph.edges, node.id)}
                      onClose={onClose}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      <GraphZoomControls
        zoom={zoom}
        onZoomOut={() => zoomTo(stepZoom(zoom, -1))}
        onZoomIn={() => zoomTo(stepZoom(zoom, 1))}
        onFit={fit}
      />
    </div>
  );
}

/// How the edges touching `id` word their relationships, each once.
function labelsOf(edges: GraphEdge[], id: string): string[] {
  const labels = edges.filter((e) => e.from === id || e.to === id).flatMap((e) => e.labels);
  return [...new Set(labels)];
}

function EdgeLabel({ edge, from, to }: { edge: GraphEdge; from: Point; to: Point }) {
  return (
    <span
      className="pointer-events-none absolute top-(--y) left-(--x) max-w-28 -translate-1/2 truncate rounded-sm bg-background/90 px-1 text-xs text-muted-foreground"
      // SAFETY: `--x` and `--y` only ever receive pixel coordinates from the layout.
      style={
        { "--x": `${(from.x + to.x) / 2}px`, "--y": `${(from.y + to.y) / 2}px` } as CSSProperties
      }
    >
      {edge.labels.join(", ")}
    </span>
  );
}

function GraphNodeButton({
  entityId,
  currentSpaceId,
  labels,
  onClose,
}: {
  entityId: string;
  currentSpaceId: string;
  labels: string[];
  onClose: () => void;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: entity } = useQuery({
    queryKey: qk.entity.byId(entityId),
    queryFn: () => getEntity(entityId),
  });
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });

  if (!entity) {
    return <div className="h-8 w-24 rounded-md bg-accent/40 motion-safe:animate-pulse" />;
  }

  const otherSpace =
    entity.spaceId !== currentSpaceId ? spaces.find((s) => s.id === entity.spaceId) : undefined;
  const title = displayTitle(entity);
  const name = [title, labels.join(", "), otherSpace && `in ${otherSpace.name}`]
    .filter(Boolean)
    .join(", ");

  // Cmd or Ctrl click (or a middle click) opens a new tab and leaves the graph where it is.
  const open = (event: React.MouseEvent) => {
    const newTab = event.metaKey || event.ctrlKey || event.button === 1;
    if (newTab) armNewTabIntent();
    openEntity(entity.id, entity.spaceId);
    if (!newTab) onClose();
  };

  return (
    <button
      type="button"
      aria-label={name}
      title={title}
      onClick={open}
      onAuxClick={(event) => {
        if (event.button === 1) open(event);
      }}
      className={cn(
        "flex w-24 flex-col items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
        entity.deletedAt && "opacity-50",
      )}
    >
      <span className="flex w-full items-center gap-1">
        <EntityIcon entity={entity} size={13} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{title}</span>
      </span>
      {otherSpace && <SpaceChip space={otherSpace} className="max-w-full" />}
    </button>
  );
}
