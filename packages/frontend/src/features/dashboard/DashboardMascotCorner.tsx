import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MascotFigure } from "#/components/mascot-figure.tsx";
import { cn } from "@nookly/ui/lib/utils";

/// Id of the element in the app shell, at the page's top right corner, that the
/// cutout draws into.
export const DASHBOARD_CORNER_SLOT = "dashboard-corner-slot";

/// The cutout, as a path in pixels from the page's top right corner (x grows right,
/// y down), around the 128px square the mascot sits in. The page's own border (1px,
/// centered at y = -0.5 and x = 0.5) runs along the top, bends down through a 20px
/// fillet, follows the cutout's big curve, bends out through a second fillet and
/// carries on down the right edge.
const BORDER =
  "M -148 -0.5 A 20 20 0 0 1 -128 19.5 L -128 38.4 A 108.5 89.6 0 0 0 -19.5 128 A 20 20 0 0 1 0.5 148";
/// The same line closed off through the outer corner, to paint over the page's own
/// straight border and rounded corner within the cutout.
const FILL = `${BORDER} L 2 148 L 2 -3 L -148 -3 Z`;

/// A corner badge in the Dashboard's top right corner. The text wraps around an
/// invisible float; the visible part is drawn in the app shell, over the page's
/// border, so the border itself follows the curve and the mascot sits outside it.
export function DashboardMascotCorner({ className }: { className?: string }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(DASHBOARD_CORNER_SLOT)), []);

  return (
    <>
      <div
        aria-hidden
        className={cn(
          "float-right -mt-6 -mr-6 mb-3 ml-6 size-32 select-none [shape-margin:12px] [shape-outside:circle(48%)]",
          className,
        )}
      />
      {slot &&
        createPortal(
          <>
            <svg
              aria-hidden
              viewBox="-150 -4 154 164"
              className="absolute -top-1 -right-1 h-41 w-38.5 overflow-visible"
            >
              <path d={FILL} className="fill-background" />
              <path d={BORDER} fill="none" className="stroke-sidebar-border" />
            </svg>
            <div className="pointer-events-auto absolute top-6.5 right-6.5 select-none">
              <MascotFigure size={76} />
            </div>
          </>,
          slot,
        )}
    </>
  );
}
