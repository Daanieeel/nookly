import { cn } from "@nookly/ui/lib/utils";

/// Just the flame from the app icon, with a soft glow behind it. It rises in once and then
/// flickers, as the hearth's does. The hero's mark above its headline.
export function Flame({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none relative flex aspect-558/409 h-24 animate-[hearth-in_1.6s_cubic-bezier(0.16,1,0.3,1)_both] items-end justify-center select-none motion-reduce:animate-none",
        className,
      )}
    >
      <div className="absolute top-1/2 left-1/2 size-72 -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,#ff8a3d_calc(var(--hearth-glow)*100%),transparent),transparent)]" />
      {/* oxlint-disable-next-line nextjs/no-img-element -- a static export has no image server */}
      <img
        src="/hearth/flame.webp"
        alt=""
        draggable={false}
        className="relative size-full origin-bottom animate-[flame-flicker_3.4s_ease-in-out_infinite] motion-reduce:animate-none"
      />
    </div>
  );
}
