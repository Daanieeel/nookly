import { cn } from "@nookly/ui/lib/utils";

/// The app icon and the name, as the nav and footer show them.
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* oxlint-disable-next-line nextjs/no-img-element -- a static export has no image server */}
      <img src="/icon-128.png" alt="" width={size} height={size} className="rounded-[22%]" />
      <span className="font-display text-lg font-semibold">Nookly</span>
    </span>
  );
}
