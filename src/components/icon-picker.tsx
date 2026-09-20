import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/// Curated, common-first emoji set — a lightweight stand-in for a full icon-library
/// browser. Good enough to make icon choice feel real without pulling in a new dependency.
const PRESET_EMOJI = [
  "📌",
  "⭐",
  "🔥",
  "💡",
  "🎯",
  "📚",
  "📝",
  "✅",
  "🗂️",
  "📁",
  "🧠",
  "🎓",
  "🧪",
  "💻",
  "🎨",
  "🎵",
  "🏃",
  "🍎",
  "🌱",
  "☕",
  "🏠",
  "💰",
  "✈️",
  "❤️",
];

/// Sets/clears an entity or Space's custom icon (emoji). §1.3/§1.6 — icon choice is
/// independent from any accent-color choice, and clearing falls back to the
/// entity type's neutral default icon.
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
  const [custom, setCustom] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setCustom("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-6 gap-0.5">
            {PRESET_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onChange(emoji);
                  setOpen(false);
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-sm text-base hover:bg-accent",
                  value === emoji && "bg-accent ring-1 ring-ring",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!custom.trim()) return;
              onChange(custom.trim());
              setOpen(false);
            }}
            className="flex gap-1.5"
          >
            <Input
              placeholder="Paste any emoji…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-7 text-sm"
            />
          </form>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="rounded-sm px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Use default icon
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
