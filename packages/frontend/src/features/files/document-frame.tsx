import { IconMoon, IconSun } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { useIsDark } from "#/lib/theme.ts";
import { cn } from "@nookly/ui/lib/utils";

/// Inverts light document pages in dark mode (hue rotated back, so colors keep
/// their hue); one click shows the original. `children` gets the class to apply
/// to the pages, so the themed space around them stays untouched.
export function InvertibleDocument({
  children,
  className,
}: {
  children: (pageClass: string) => ReactNode;
  className?: string;
}) {
  const isDark = useIsDark();
  const [original, setOriginal] = useState(false);
  const inverted = isDark && !original;
  const label = inverted ? "Show Original Colors" : "Show in Dark Colors";
  return (
    <div className={cn("relative size-full", className)}>
      {children(inverted ? "invert hue-rotate-180" : "")}
      {isDark && (
        <span className="absolute top-2 right-2 z-10 flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="iconSm"
                aria-label={label}
                aria-pressed={original}
                onClick={() => setOriginal((v) => !v)}
              >
                {inverted ? <IconSun /> : <IconMoon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        </span>
      )}
    </div>
  );
}

/// WebKit's own PDF viewer, which only draws light.
export function PdfViewer({ src, name }: { src: string; name: string }) {
  return (
    <InvertibleDocument>
      {(pageClass) => (
        <iframe
          src={src}
          title={name}
          className={cn(
            "size-full rounded-md border border-border",
            pageClass && cn("border-transparent", pageClass),
          )}
        />
      )}
    </InvertibleDocument>
  );
}
