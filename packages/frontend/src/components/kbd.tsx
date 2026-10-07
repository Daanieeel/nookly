import { Kbd as BaseKbd, KbdGroup } from "@nookly/ui/components/kbd";
import { Children, type ComponentProps, isValidElement } from "react";
import { platformKeys } from "#/lib/platform.ts";

/// The shared Kbd, with Mac symbols spelled out as Ctrl, Alt and Shift elsewhere.
function Kbd({ children, ...props }: ComponentProps<typeof BaseKbd>) {
  return (
    <BaseKbd {...props}>
      {Children.map(children, (child) =>
        isValidElement(child) || child == null ? child : platformKeys(String(child)),
      )}
    </BaseKbd>
  );
}

export { Kbd, KbdGroup };
