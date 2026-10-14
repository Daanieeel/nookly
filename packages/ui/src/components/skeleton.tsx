import { SKELETON_CLASSES } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(SKELETON_CLASSES, className)} {...props} />;
}

export { Skeleton };
