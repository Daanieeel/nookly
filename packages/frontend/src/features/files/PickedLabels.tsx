import { IconTag, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { UNLABELLED } from "@nookly/shared/label-shelf";
import { LabelDot } from "#/components/label-chip.tsx";
import type { Label } from "#/lib/api/types.ts";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { FileLabelChoice, type FileLabelOptions } from "./FileLabelChoice";

const CHIP =
  "flex h-7 items-center gap-1.5 rounded-md bg-accent pr-1 pl-2.5 text-xs text-accent-foreground";

/// The labels the page or its View shows the files of, above the files (D74, D81): only
/// the ones picked, each to take off, and a searchable list to change them. Nothing shows
/// while none is picked, so a Space with many labels keeps a quiet page.
export function PickedLabels({
  picked,
  labels,
  options,
  onPick,
  showsFiles,
}: {
  picked: string[];
  labels: Label[];
  options: FileLabelOptions;
  onPick: (next: string[]) => void;
  /// Whether any file is shown, for the nudge under the files without a label.
  showsFiles: boolean;
}) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const live = picked.filter((id) => id === UNLABELLED || byId.has(id));
  const [choosing, setChoosing] = useState(false);
  // The list stays open after its last label is taken off, to pick another.
  if (live.length === 0 && !choosing) return null;
  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-4 py-2">
      <div role="group" aria-label="Labels shown" className="flex flex-wrap items-center gap-1.5">
        {live.map((id) => {
          const name = byId.get(id)?.name ?? "Files without a label";
          const label = byId.get(id);
          return (
            <span key={id} className={CHIP}>
              {label && <LabelDot label={label} />}
              {name}
              <button
                type="button"
                aria-label={`Stop filtering by ${name}`}
                title={`Stop filtering by ${name}`}
                onClick={() => onPick(live.filter((x) => x !== id))}
                className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <IconX size={12} aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <Popover open={choosing} onOpenChange={setChoosing}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <IconTag />
              Change labels
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" aria-label="Change labels" className="w-72 p-0">
            <FileLabelChoice
              options={options}
              picked={live}
              onChange={onPick}
              className="border-0"
            />
          </PopoverContent>
        </Popover>
      </div>
      {live.includes(UNLABELLED) && showsFiles && (
        <p className="text-xs text-muted-foreground">
          Give these a label and they show under every View of that label.
        </p>
      )}
    </div>
  );
}
