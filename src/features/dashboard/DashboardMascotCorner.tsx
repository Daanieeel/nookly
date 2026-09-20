import { MascotFigure } from "@/components/mascot-figure";
import { cn } from "@/lib/utils";

/// A corner badge in the dashboard's top-right corner with inverted-radius
/// fillets (::before and ::after) that smoothly round off the corners where
/// it cuts into the main content card's background.
export function DashboardMascotCorner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mascot-corner-badge relative float-right -mt-6 -mr-6 ml-6 mb-3 flex size-32 items-center justify-center bg-background select-none",
        "[shape-outside:circle(48%)] [shape-margin:12px]",
        className,
      )}
    >
      <MascotFigure size={76} />
    </div>
  );
}
