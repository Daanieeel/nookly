import {
  IconApple,
  IconBallFootball,
  IconBox,
  IconFlag,
  IconMathSymbols,
  IconMoodSmile,
  IconPaw,
  IconPlane,
  IconUsers,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import emojiGroups from "unicode-emoji-json/data-by-group.json";
import {
  ICON_LIBRARY,
  iconLibraryValue,
  isIconLibraryValue,
  parseIconLibraryValue,
} from "#/components/entity-icon.tsx";
import { ACCENT_COLORS } from "#/lib/colors.ts";
import { Input } from "@nookly/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import { cn } from "@nookly/ui/lib/utils";

const CATEGORY_ICONS = new Map<string, TablerIcon>([
  ["smileys_emotion", IconMoodSmile],
  ["people_body", IconUsers],
  ["animals_nature", IconPaw],
  ["food_drink", IconApple],
  ["travel_places", IconPlane],
  ["activities", IconBallFootball],
  ["objects", IconBox],
  ["symbols", IconMathSymbols],
  ["flags", IconFlag],
]);

interface EmojiEntry {
  emoji: string;
  name: string;
}

const ALL_EMOJI: EmojiEntry[] = emojiGroups.flatMap((g) => g.emojis);

function EmojiGrid({
  emojis,
  value,
  onPick,
}: {
  emojis: EmojiEntry[];
  value: string | null;
  onPick: (emoji: string) => void;
}) {
  if (emojis.length === 0) {
    return <p className="px-1 py-6 text-center text-xs text-muted-foreground">No emoji found</p>;
  }
  return (
    <div className="grid grid-cols-7 gap-0.5">
      {emojis.map((e) => (
        <button
          key={e.emoji}
          type="button"
          title={e.name}
          onClick={() => onPick(e.emoji)}
          className={cn(
            "flex size-8 items-center justify-center rounded-sm text-base hover:bg-accent",
            value === e.emoji && "bg-accent ring-1 ring-ring",
          )}
        >
          {e.emoji}
        </button>
      ))}
    </div>
  );
}

/// Sets/clears an entity or Space's custom icon — either a Tabler icon-library
/// selection or a literal emoji (§1.3/§1.6). Icon choice is independent from
/// any accent-color choice, and clearing falls back to the entity type's
/// neutral default icon.
///
/// With `withColor`, the Icons tab adds a row of colors tinting the icon (emoji
/// keep their own colors). Off by default: most icons stay neutral.
export function IconPicker({
  value,
  onChange,
  trigger,
  withColor = false,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  trigger: React.ReactNode;
  withColor?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = value && isIconLibraryValue(value) ? parseIconLibraryValue(value) : null;
  // A color picked before any icon is kept for the icon chosen next.
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const color = current ? current.color : pendingColor;

  function pickColor(next: string | null) {
    setPendingColor(next);
    if (current) onChange(iconLibraryValue(current.name, next));
  }
  const [category, setCategory] = useState(0);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!query) return null;
    return ALL_EMOJI.filter((e) => e.name.includes(query));
  }, [query]);

  function pickEmoji(emoji: string) {
    onChange(emoji);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Tabs defaultValue={value && !isIconLibraryValue(value) ? "emoji" : "icons"}>
          <TabsList size="sm" className="w-full">
            <TabsTrigger value="icons" size="sm">
              Icons
            </TabsTrigger>
            <TabsTrigger value="emoji" size="sm">
              Emoji
            </TabsTrigger>
          </TabsList>

          <TabsContent value="icons" className="flex flex-col gap-2">
            {withColor && (
              <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
                <button
                  type="button"
                  aria-label="No color"
                  aria-pressed={color === null}
                  onClick={() => pickColor(null)}
                  className={cn(
                    "size-5 rounded-full border border-border bg-muted-foreground/40",
                    color === null && "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                  )}
                />
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={color === c}
                    onClick={() => pickColor(c)}
                    className={cn(
                      "size-5 rounded-full bg-(--swatch-color)",
                      color === c && "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                    )}
                    // SAFETY: `--swatch-color` only ever receives `c`, a plain hex string from
                    // `ACCENT_COLORS`. `CSSProperties` just doesn't model custom properties.
                    style={{ "--swatch-color": c } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
            <div className="grid grid-cols-7 gap-0.5">
              {[...ICON_LIBRARY].map(([name, Icon]) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => {
                    onChange(iconLibraryValue(name, withColor ? color : null));
                    setOpen(false);
                  }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                    current?.name === name && "bg-accent text-foreground ring-1 ring-ring",
                  )}
                >
                  <Icon size={16} color={withColor && color ? color : undefined} />
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="emoji" className="flex flex-col gap-2">
            <Input
              placeholder="Search emoji…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-sm"
            />

            {!query && (
              <div className="flex items-center gap-0.5 border-b border-border pb-1.5">
                {emojiGroups.map((group, i) => {
                  const Icon = CATEGORY_ICONS.get(group.slug);
                  return (
                    <button
                      key={group.slug}
                      type="button"
                      title={group.name}
                      onClick={() => setCategory(i)}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                        category === i && "bg-accent text-foreground",
                      )}
                    >
                      {Icon && <Icon size={15} />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="max-h-56 overflow-y-auto">
              <EmojiGrid
                emojis={query ? (searchResults ?? []) : emojiGroups[category].emojis}
                value={value}
                onPick={pickEmoji}
              />
            </div>
          </TabsContent>
        </Tabs>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-2 w-full rounded-sm px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Use default icon
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
