import { IconCheck } from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";
import { type FileViewerTheme, useFileViewerThemeStore } from "#/lib/file-viewer-theme.ts";
import { type Theme, useThemeStore } from "#/lib/theme.ts";

/// How a choice looks in its preview. `split` shows both, for "follow the system" and "use
/// the defaults". Literal colours: a preview shows a theme, so it can't follow the current one.
type Tone = "light" | "dark" | "split";

const TONE_SURFACE = {
  light: { window: "bg-white", bar: "bg-zinc-100", side: "bg-zinc-100", line: "bg-zinc-300" },
  dark: { window: "bg-zinc-900", bar: "bg-zinc-800", side: "bg-zinc-800", line: "bg-zinc-600" },
};

/// A small window drawn in one of the two looks.
function MiniWindow({ tone, className }: { tone: "light" | "dark"; className?: string }) {
  const surface = TONE_SURFACE[tone];
  return (
    <div className={cn("flex size-full flex-col", surface.window, className)}>
      <div className={cn("flex h-2.5 shrink-0 items-center gap-0.5 px-1", surface.bar)}>
        <span className={cn("size-1 rounded-full", surface.line)} />
        <span className={cn("size-1 rounded-full", surface.line)} />
      </div>
      <div className="flex min-h-0 flex-1 gap-1 p-1">
        <div className={cn("w-3 shrink-0 rounded-xs", surface.side)} />
        <div className="flex flex-1 flex-col gap-1 pt-0.5">
          <span className={cn("h-1 w-3/4 rounded-full", surface.line)} />
          <span className={cn("h-1 w-full rounded-full", surface.line)} />
          <span className={cn("h-1 w-1/2 rounded-full", surface.line)} />
        </div>
      </div>
    </div>
  );
}

function Preview({ tone }: { tone: Tone }) {
  return (
    <div
      aria-hidden
      className="relative h-16 w-full overflow-hidden rounded-md border border-border"
    >
      {tone === "split" ? (
        <>
          <MiniWindow tone="light" />
          <MiniWindow
            tone="dark"
            className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
          />
        </>
      ) : (
        <MiniWindow tone={tone} />
      )}
    </div>
  );
}

interface Choice<T extends string> {
  value: T;
  label: string;
  tone: Tone;
}

/// One card per choice with a small preview of it. A single choice, so it reads as a radio group.
function ChoiceCards<T extends string>({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  choices: Choice<T>[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-3">
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice.value)}
            className={cn(
              "flex cursor-pointer flex-col gap-2 rounded-lg border border-border p-2 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary bg-primary/10",
            )}
          >
            <Preview tone={choice.tone} />
            <span className="flex items-center justify-between px-0.5 text-sm font-medium">
              {choice.label}
              {selected && <IconCheck size={14} className="text-primary" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const THEMES: Choice<Theme>[] = [
  { value: "light", label: "Light", tone: "light" },
  { value: "dark", label: "Dark", tone: "dark" },
  { value: "system", label: "System", tone: "split" },
];

export function ThemeCards() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  return <ChoiceCards label="Theme" value={theme} onChange={setTheme} choices={THEMES} />;
}

const VIEWER_THEMES: Choice<FileViewerTheme>[] = [
  { value: "light", label: "Light", tone: "light" },
  { value: "dark", label: "Dark", tone: "dark" },
  { value: "defaults", label: "Use Defaults", tone: "split" },
];

export function FileViewerThemeCards() {
  const theme = useFileViewerThemeStore((s) => s.theme);
  const setTheme = useFileViewerThemeStore((s) => s.setTheme);
  return (
    <ChoiceCards
      label="File viewer theme"
      value={theme}
      onChange={setTheme}
      choices={VIEWER_THEMES}
    />
  );
}
