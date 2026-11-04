import { cn } from "@nookly/ui/lib/utils";

const TONES = {
  positive: "[&::-webkit-progress-value]:bg-positive [&::-moz-progress-bar]:bg-positive",
  caution: "[&::-webkit-progress-value]:bg-caution [&::-moz-progress-bar]:bg-caution",
} satisfies Record<string, string>;

/// A thin bar for a share of 100, as a native `<progress>`: it is announced as one and needs no
/// width set from code.
export function MoodleProgress({
  value,
  label,
  tone = "positive",
  className,
}: {
  value: number;
  label: string;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <progress
      aria-label={label}
      value={value}
      max={100}
      className={cn(
        "h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
        TONES[tone],
        className,
      )}
    />
  );
}
