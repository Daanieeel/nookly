import { IconCheck, IconTagOff } from "@tabler/icons-react";
import { type LabelCounts, UNLABELLED, labelCounts, togglePick } from "@nookly/shared/label-shelf";
import { LabelDot } from "#/components/label-chip.tsx";
import type { FileEntity, Label } from "#/lib/api/types.ts";
import { accentInsensitiveFilter } from "#/lib/command-filter.ts";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nookly/ui/components/command";
import { cn } from "@nookly/ui/lib/utils";

/// The labels a Files View can be made of, most used first, each with how many of the
/// Space's files carry it, and how many files carry none.
export type FileLabelOptions = LabelCounts<Label>;

export function fileLabelOptions(files: FileEntity[], labels: Label[]): FileLabelOptions {
  return labelCounts(files, (f) => f.labelIds, labels);
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input",
        checked && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {checked && <IconCheck size={12} className="text-primary-foreground" />}
    </span>
  );
}

/// A searchable list of the Space's labels to tick for a Files View: it shows the files
/// carrying every label ticked, or only the files without a label.
export function FileLabelChoice({
  options,
  picked,
  onChange,
  className,
}: {
  options: FileLabelOptions;
  picked: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Labels"
      className={cn("rounded-md border border-input", className)}
    >
      <Command loop filter={accentInsensitiveFilter}>
        <CommandInput placeholder="Search labels…" />
        <CommandList className="max-h-56 p-1">
          <CommandEmpty>No labels match.</CommandEmpty>
          {options.labels.map(({ label, count }) => (
            <CommandItem
              key={label.id}
              value={label.name}
              onSelect={() => onChange(togglePick(picked, label.id))}
            >
              <Check checked={picked.includes(label.id)} />
              <LabelDot label={label} />
              <span className="min-w-0 flex-1 truncate">{label.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
            </CommandItem>
          ))}
          {options.unlabelled > 0 && (
            <CommandItem
              value="Unlabelled"
              onSelect={() => onChange(togglePick(picked, UNLABELLED))}
            >
              <Check checked={picked.includes(UNLABELLED)} />
              <IconTagOff size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                Files without a label
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {options.unlabelled}
              </span>
            </CommandItem>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
