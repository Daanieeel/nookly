import { IconX } from "@tabler/icons-react";
import { type Shelf, UNLABELLED } from "@nookly/shared/label-shelf";
import { LabelDot } from "#/components/label-chip.tsx";
import type { FileEntity, Label } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";

const CHIP =
  "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/// The label shelf atop Files (D74): the labels picked, then the labels the files shown
/// also carry with how many files each holds, then, quietly, the files with no label.
export function LabelShelf({
  shelf,
  picked,
  labels,
  onPick,
}: {
  shelf: Shelf<FileEntity>;
  picked: string[];
  labels: Label[];
  onPick: (next: string[]) => void;
}) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const live = picked.filter((id) => id === UNLABELLED || byId.has(id));
  const unlabelledPicked = live.includes(UNLABELLED);
  if (live.length === 0 && shelf.labels.length === 0 && shelf.unlabelled === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-4 py-2">
      <div
        role="group"
        aria-label="Browse by label"
        className="flex flex-wrap items-center gap-1.5"
      >
        {live.map((id) => {
          const label = byId.get(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed
              onClick={() => onPick(live.filter((x) => x !== id))}
              className={cn(CHIP, "bg-accent text-accent-foreground hover:bg-accent/80")}
            >
              {label && <LabelDot label={label} />}
              {label?.name ?? "Unlabelled"}
              <IconX size={12} aria-hidden="true" />
            </button>
          );
        })}
        {!unlabelledPicked &&
          shelf.labels.map(({ id, count }) => {
            const label = byId.get(id);
            if (!label) return null;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={false}
                onClick={() => onPick([...live, id])}
                className={cn(CHIP, "bg-secondary text-secondary-foreground hover:bg-secondary/70")}
              >
                <LabelDot label={label} />
                {label.name}
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </button>
            );
          })}
        {live.length === 0 && shelf.unlabelled > 0 && (
          <button
            type="button"
            aria-pressed={false}
            onClick={() => onPick([UNLABELLED])}
            className={cn(
              CHIP,
              "border border-dashed border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Unlabelled
            <span className="tabular-nums">{shelf.unlabelled}</span>
          </button>
        )}
      </div>
      {unlabelledPicked && shelf.shown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Give these a label and they turn up on the shelf, under every label they carry.
        </p>
      )}
    </div>
  );
}
