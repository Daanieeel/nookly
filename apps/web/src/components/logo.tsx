import { cn } from "@nookly/ui/lib/utils";

/// The app icon and the name, as the nav and footer show them. A block box, so the link
/// around it does not set it on a text baseline.
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {/* oxlint-disable-next-line nextjs/no-img-element -- a static export has no image server */}
      <img src="/icon-128.png" alt="" width={size} height={size} className="rounded-[22%]" />
      <span className="font-display text-lg font-semibold">Nookly</span>
    </span>
  );
}
