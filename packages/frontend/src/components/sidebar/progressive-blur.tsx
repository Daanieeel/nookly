/// Heights of the stacked blur steps, tallest first. Each adds some blur (`BLURS`) and a veil of
/// the sidebar's own color (`TINTS`), so both grow from almost nothing at the top to about 16px of
/// blur and a 56% veil at the bottom. The top edge is only ever the first, single step, which is
/// too small to see.
const STEP_HEIGHTS = [
  "h-full",
  "h-15/16",
  "h-7/8",
  "h-13/16",
  "h-3/4",
  "h-11/16",
  "h-5/8",
  "h-9/16",
  "h-1/2",
  "h-7/16",
  "h-3/8",
  "h-5/16",
  "h-1/4",
  "h-3/16",
  "h-1/8",
  "h-1/16",
];

/// The veil of each group of four steps, from the top down, the last one holding for the rest:
/// 1%, 3%, 6%, then 10% of the sidebar's color, so the list is covered by about 56% at the bottom.
const TINTS = ["bg-sidebar/1", "bg-sidebar/3", "bg-sidebar/6", "bg-sidebar/10"];

/// The blur of each group of four steps, from the top down: 0.4px, 0.8px, 1.2px, then 1.6px.
const BLURS = [
  "backdrop-blur-step-1",
  "backdrop-blur-step-2",
  "backdrop-blur-step-3",
  "backdrop-blur-step-4",
];

/// A blur that tapers off upward, for the edge where a list scrolls under something. Fills its
/// positioned parent and reaches `-top-10` above it, so the fade is longer than the parent without
/// the parent needing room for it. Sits behind the parent's content and lets every click through.
export function ProgressiveBlur() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 -z-10 overflow-hidden rounded-b-lg"
    >
      {STEP_HEIGHTS.map((height, i) => {
        const group = Math.min(Math.floor(i / 4), BLURS.length - 1);
        return (
          <div
            key={height}
            className={`absolute inset-x-0 bottom-0 ${BLURS[group]} ${TINTS[group]} ${height}`}
          />
        );
      })}
    </div>
  );
}
