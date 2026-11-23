import { useMemo, useState, type ComponentProps } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { CopyButton } from "@nookly/ui/components/copy-button";
import { scramble } from "@nookly/ui/lib/scramble";
import { cn } from "@nookly/ui/lib/utils";

/// A secret kept out of sight: a key or a code shown blurred, and made of random characters
/// while it is, so it can't be read over a shoulder, selected or copied from the page. A click
/// shows it, another hides it. The copy button always copies the real one. `label` names it
/// for a screen reader ("key"); `value` is never put in the page while hidden.
function BlurredSecret({
  value,
  label,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { value: string; label: string }) {
  const [shown, setShown] = useState(false);
  const decoy = useMemo(() => scramble(value), [value]);
  const Eye = shown ? EyeOffIcon : EyeIcon;
  return (
    <div
      data-slot="blurred-secret"
      className={cn("flex max-w-full items-center justify-center gap-1", className)}
      {...props}
    >
      <button
        type="button"
        aria-label={shown ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
        className="group flex min-w-0 cursor-pointer items-center gap-2 rounded-md bg-muted px-2 py-1 text-left outline-none focus-ring"
      >
        <code
          aria-hidden={!shown}
          className={cn(
            "min-w-0 font-mono text-xs tracking-wider break-all transition-[filter]",
            shown ? "select-all" : "blur-[5px] select-none",
          )}
        >
          {shown ? value : decoy}
        </code>
        <Eye aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      <CopyButton
        value={value}
        aria-label={`Copy ${label}`}
        className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
      />
    </div>
  );
}

export { BlurredSecret };
