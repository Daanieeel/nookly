import { cn } from "@/lib/utils";

/// Inline mention of a resource/entity inside prose (confirmation dialogs,
/// mainly) — a code-block-style box with its icon, so the specific thing
/// being acted on stands out from surrounding text instead of blending in as
/// a quoted string. Not a link/button on purpose (confirmation-dialogs
/// skill): it's here to be read, not clicked.
export function EntityMention({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-muted px-1.5 py-0.5 align-middle font-mono text-sm font-medium text-foreground",
        className,
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
