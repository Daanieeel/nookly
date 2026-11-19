import { cn } from "@nookly/ui/lib/utils";

/// Just the flame from the app icon, with a soft glow behind it. It rises in once and then
/// dances, livelier than the hearth's quiet flicker. The hero's mark above its headline.
export function Flame({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none relative flex aspect-558/409 h-24 animate-[hearth-in_1.6s_cubic-bezier(0.16,1,0.3,1)_both] items-end justify-center select-none motion-reduce:animate-none",
        className,
      )}
    >
      {/* A wide, soft oval that fades out long before its edge, so it never reads as a disc. */}
      <div className="absolute top-3/5 left-1/2 h-48 w-96 -translate-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklab,#ff8a3d_calc(var(--hearth-glow)*100%),transparent),color-mix(in_oklab,#ff8a3d_calc(var(--hearth-glow)*30%),transparent)_45%,transparent)]" />
      {/* oxlint-disable-next-line nextjs/no-img-element -- a static export has no image server */}
      <img
        src="/hearth/flame.webp"
        alt=""
        draggable={false}
        className="relative size-full origin-bottom animate-[flame-dance_5s_ease-in-out_infinite] motion-reduce:animate-none"
      />
    </div>
  );
}
