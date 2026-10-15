import { IconStar, IconStarOff } from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";

/// How an assignment is evaluated, shown as the current status: a gray Ungraded for work
/// like homework, a caution colored Graded for work that counts towards the course grade.
/// Clicking it flips to the other one.
export function EvaluationToggle({
  ungraded,
  onToggle,
  className,
}: {
  ungraded: boolean;
  onToggle: (ungraded: boolean) => void;
  className?: string;
}) {
  const Icon = ungraded ? IconStarOff : IconStar;
  return (
    <button
      type="button"
      onClick={() => onToggle(!ungraded)}
      className={cn(
        className,
        ungraded ? "text-muted-foreground" : "text-caution hover:text-caution",
      )}
    >
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{ungraded ? "Ungraded" : "Graded"}</span>
    </button>
  );
}
