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
import { ICON_LIBRARY, iconLibraryValue, isIconLibraryValue } from "#/components/entity-icon.tsx";
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
export function IconPicker({
  value,
  onChange,
  trigger,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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

          <TabsContent value="icons" className="grid grid-cols-7 gap-0.5">
            {[...ICON_LIBRARY].map(([name, Icon]) => {
              const iconValue = iconLibraryValue(name);
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => {
                    onChange(iconValue);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                    value === iconValue && "bg-accent text-foreground ring-1 ring-ring",
                  )}
                >
                  <Icon size={16} />
                </button>
              );
            })}
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
