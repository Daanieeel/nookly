import type * as React from "react";

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { cn } from "@nookly/ui/lib/utils";

/// A submenu in a dropdown menu: a row with an icon and a label (spaced like a plain
/// `DropdownMenuItem`) and a chevron, which opens `children` beside it.
function DropdownSubmenu({
  icon,
  label,
  className,
  children,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={cn("gap-2", className)}>
        {icon}
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export { DropdownSubmenu };
