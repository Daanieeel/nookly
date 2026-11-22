import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import * as React from "react";

import { Input } from "@nookly/ui/components/input";
import { cn } from "@nookly/ui/lib/utils";

/// An Input with a small icon on its left that says what the field is for. Layout classes
/// (width, margin) go on `className` and land on the wrapper, `inputClassName` styles the input.
/// `addon` is fixed text between the icon and what is typed, such as the `https://` of an address.
function IconInput({
  icon: Icon,
  className,
  inputClassName,
  trailing,
  addon,
  addonClassName,
  style,
  ...props
}: React.ComponentProps<"input"> & {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  inputClassName?: string;
  /// Sits inside the right edge of the field, such as a button; the input leaves room for it.
  trailing?: ReactNode;
  addon?: string;
  addonClassName?: string;
}) {
  const addonRef = useRef<HTMLSpanElement>(null);
  const [addonWidth, setAddonWidth] = useState(0);
  // The input starts its text after the addon, whatever its width in the field's font.
  useLayoutEffect(() => {
    setAddonWidth(addonRef.current?.offsetWidth ?? 0);
  }, [addon]);
  return (
    <div data-slot="icon-input" className={cn("relative w-full min-w-0", className)}>
      <Icon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      {addon ? (
        <span
          ref={addonRef}
          className={cn(
            "pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-ui text-muted-foreground select-none",
            addonClassName,
          )}
        >
          {addon}
        </span>
      ) : null}
      <Input
        className={cn("pl-9", addon && "pl-(--addon-pad)", trailing && "pr-9", inputClassName)}
        // 36px is the icon's room (`pl-9`), the addon's own width follows it.
        // SAFETY: a custom property is a valid style key, React's CSSProperties just does not list it.
        style={
          addon
            ? ({ "--addon-pad": `${36 + addonWidth}px`, ...style } as React.CSSProperties)
            : style
        }
        {...props}
      />
      {trailing}
    </div>
  );
}

export { IconInput };
