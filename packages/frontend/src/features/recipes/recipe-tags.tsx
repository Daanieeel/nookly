import {
  IconBolt,
  IconBread,
  IconCake,
  IconChefHat,
  IconCheck,
  IconChevronDown,
  IconFish,
  IconFlame,
  IconLeaf,
  IconPepper,
  IconPig,
  IconPlus,
  IconSalad,
  IconSeeding,
  IconSoup,
  IconTag,
} from "@tabler/icons-react";
import { Beef, Drumstick } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { PendingIcon } from "#/features/tasks/task-properties.tsx";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nookly/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import type { RecipeTag } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";

/// Maps a `RecipeTag.icon` key (a fixed, curated set — see the seed data in
/// `src-tauri/src/db/recipes.rs`) to a component. Unlike `entity-icon.tsx`'s
/// `ICON_LIBRARY`, this isn't user-facing — recipe tags aren't user-creatable
/// in this version, so nothing here needs to be picker-browsable.
type TagIcon = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;

/// Tabler has no chicken or cow (only `IconPig`), so those two borrow Lucide's
/// `Drumstick` and `Beef`.
const TAG_ICONS = new Map<string, TagIcon>([
  ["drumstick", Drumstick],
  ["beef", Beef],
  ["pig", IconPig],
  ["fish", IconFish],
  ["leaf", IconLeaf],
  ["seedling", IconSeeding],
  ["salad", IconSalad],
  ["soup", IconSoup],
  ["chef", IconChefHat],
  ["bread", IconBread],
  ["cake", IconCake],
  ["flame", IconFlame],
  ["pepper", IconPepper],
  ["bolt", IconBolt],
]);

function iconForTag(icon: string): TagIcon {
  return TAG_ICONS.get(icon) ?? IconTag;
}

/// A recipe tag as a small quiet chip — the icon carries the tag's color
/// (Tabler icons draw with `currentColor`), the same convention `EntityIcon`
/// uses, rather than a plain color dot: tags already have a specific icon per
/// category, so showing it reads better than reducing that back to a dot.
export function RecipeTagChip({ tag, className }: { tag: RecipeTag; className?: string }) {
  const Icon = iconForTag(tag.icon);
  return (
    <span
      className={cn(
        "recipe-tag-chip inline-flex h-5 min-w-0 max-w-32 items-center gap-1 rounded-sm border px-1.5 text-xs text-foreground",
        className,
      )}
      // SAFETY: `--tag-color` only ever receives `tag.color`, a plain hex
      // string from the recipe-tags catalog; `CSSProperties` doesn't model
      // custom properties.
      style={{ "--tag-color": tag.color } as CSSProperties}
    >
      <Icon size={11} className="shrink-0" />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

/// Multi-select popover over the fixed recipe-tags catalog — no create
/// affordance, since tags aren't user-creatable in this version (unlike
/// `LabelsPicker`, which this otherwise mirrors: a `Command` list of
/// checkable rows, selected ones floating to the top while the popover stays
/// open).
export function RecipeTagsPicker({
  tags,
  selected,
  onToggle,
  pendingId,
  failedId,
  children,
}: {
  tags: RecipeTag[];
  selected: string[];
  onToggle: (tagId: string) => void;
  pendingId?: string;
  failedId?: string;
  children: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<string[] | null>(null);
  const orderedTags = order
    ? [...tags].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : tags;

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
          return;
        }
        const selectedIds = tags.filter((t) => selected.includes(t.id)).map((t) => t.id);
        const unselectedIds = tags.filter((t) => !selected.includes(t.id)).map((t) => t.id);
        setOrder([...selectedIds, ...unselectedIds]);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56" align="start" onKeyDown={(e) => e.stopPropagation()}>
        <Command loop>
          <CommandInput placeholder="Find tags…" value={search} onValueChange={setSearch} />
          <CommandList className="p-1">
            <CommandEmpty>No tag found.</CommandEmpty>
            {orderedTags.map((tag) => {
              const checked = selected.includes(tag.id);
              const Icon = iconForTag(tag.icon);
              return (
                <CommandItem key={tag.id} value={tag.name} onSelect={() => onToggle(tag.id)}>
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-sm border border-input",
                      checked && "border-primary bg-primary",
                    )}
                  >
                    <PendingIcon
                      pending={pendingId === tag.id}
                      failed={failedId === tag.id}
                      idle={checked && <IconCheck size={12} className="text-primary-foreground" />}
                    />
                  </span>
                  <Icon
                    size={13}
                    className="shrink-0 text-(--tag-color)"
                    // SAFETY: `--tag-color` only ever receives `tag.color`, a
                    // plain hex string from the recipe-tags catalog;
                    // `CSSProperties` doesn't model custom properties.
                    style={{ "--tag-color": tag.color } as CSSProperties}
                  />
                  <span className="truncate">{tag.name}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/// The properties row's trigger: laid out like `SelectTrigger` (same height,
/// surface, and a chevron on the far right). One tag shows as its chip; from
/// two on it collapses to "N selected" so the trigger never outgrows its
/// neighbors. Nothing selected shows a plain "Add tags" affordance.
export function RecipeTagsTrigger({ tags }: { tags: RecipeTag[] }) {
  const [only] = tags;
  return (
    <span className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-accent px-3 text-sm hover:bg-accent/80">
      <span className="flex min-w-0 items-center overflow-hidden">
        {tags.length === 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <IconPlus size={14} /> Add tags
          </span>
        )}
        {tags.length === 1 && only && <RecipeTagChip tag={only} />}
        {tags.length > 1 && <span className="truncate">{tags.length} selected</span>}
      </span>
      <IconChevronDown size={16} className="shrink-0 opacity-50" />
    </span>
  );
}
