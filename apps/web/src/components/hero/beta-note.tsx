const DRAW = "animate-[draw_0.5s_ease-out_both] motion-reduce:animate-none";

/// A scribbled "In Beta", as if added to the page by hand afterwards: a loose underline
/// under it and an arrow back at the download button, both drawn in a beat after the words
/// appear. It sits beside the button (the parent is `relative`), or under it on a phone,
/// where there is no room beside it and no arrow.
export function BetaNote({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute top-full left-[40%] mt-2 flex -translate-x-1/2 animate-[fade-up_0.7s_ease-out_0.9s_both] items-center gap-1 select-none md:top-1/2 md:left-full md:mt-0 md:ml-3 md:-translate-y-1/2 md:translate-x-0 motion-reduce:animate-none">
      <svg
        aria-hidden
        viewBox="0 0 48 32"
        fill="none"
        className="hidden h-8 w-12 text-accent-yellow md:block"
      >
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M45 20 C32 29 14 27 5 13"
            pathLength="1"
            strokeDasharray="1"
            className={`[animation-delay:1.3s] ${DRAW}`}
          />
          <path
            d="M3 23 L4.5 12 L15 14"
            pathLength="1"
            strokeDasharray="1"
            className={`[animation-delay:1.7s] ${DRAW}`}
          />
        </g>
      </svg>
      <span className="relative -rotate-6">
        <span className="font-handwriting block text-3xl whitespace-nowrap text-accent-yellow sm:text-4xl">
          {label}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 80 8"
          fill="none"
          preserveAspectRatio="none"
          className="absolute inset-x-0 -bottom-0.5 h-2 w-full text-accent-yellow"
        >
          <path
            d="M2 5 C20 1 44 7 78 2"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            strokeDasharray="1"
            className={`[animation-delay:1.1s] ${DRAW}`}
          />
        </svg>
      </span>
    </div>
  );
}
