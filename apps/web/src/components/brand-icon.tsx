import { siApple, siAppstore, siDebian, siFedora, siUbuntu } from "simple-icons";
import { cn } from "@nookly/ui/lib/utils";

const MARKS = {
  apple: siApple,
  appstore: siAppstore,
  debian: siDebian,
  fedora: siFedora,
  ubuntu: siUbuntu,
} as const;

export type Brand = keyof typeof MARKS | "linux" | "windows";

/// A colour that falls back to the text colour when the mark is not coloured.
const paint = (colored: boolean, colour: string) => (colored ? colour : "currentColor");

/// Windows' four panes in its own four colours.
function WindowsMark({ colored }: { colored: boolean }) {
  const panes = [
    { x: 2, y: 2, fill: "#F25022" },
    { x: 12.5, y: 2, fill: "#7FBA00" },
    { x: 2, y: 12.5, fill: "#00A4EF" },
    { x: 12.5, y: 12.5, fill: "#FFB900" },
  ];
  return panes.map((pane) => (
    <rect
      key={pane.fill}
      x={pane.x}
      y={pane.y}
      width={9.5}
      height={9.5}
      fill={paint(colored, pane.fill)}
    />
  ));
}

/// Tux: a black penguin with a white belly and eyes and a yellow beak and feet. Uncoloured
/// it is one silhouette in the text colour.
function LinuxMark({ colored }: { colored: boolean }) {
  const black = paint(colored, "#111111");
  const white = paint(colored, "#FFFFFF");
  const yellow = paint(colored, "#FCC624");
  return (
    <>
      <ellipse cx={8.1} cy={21.4} rx={2.9} ry={1.3} fill={yellow} />
      <ellipse cx={15.9} cy={21.4} rx={2.9} ry={1.3} fill={yellow} />
      <path
        d="M12 1.4c-2.6 0-3.9 2-3.9 4.6 0 1.4-.4 2.3-1.3 3.7C5.6 11.6 4.6 14 4.6 16.4c0 1.6.7 2.6 1.8 3.3.9.6 2.2.8 3.1.8h5c.9 0 2.2-.2 3.1-.8 1.1-.7 1.8-1.7 1.8-3.3 0-2.4-1-4.8-2.2-6.7-.9-1.4-1.3-2.3-1.3-3.7 0-2.6-1.3-4.6-3.9-4.6Z"
        fill={black}
      />
      <ellipse cx={12} cy={15.4} rx={3.8} ry={4.9} fill={white} />
      <circle cx={10.5} cy={5.5} r={1.15} fill={white} />
      <circle cx={13.5} cy={5.5} r={1.15} fill={white} />
      <circle cx={10.6} cy={5.6} r={0.5} fill={black} />
      <circle cx={13.4} cy={5.6} r={0.5} fill={black} />
      <path
        d="M10.1 7.5c.5-.7 1.2-1 1.9-1s1.4.3 1.9 1c-.3 1.1-1.1 1.8-1.9 1.8s-1.6-.7-1.9-1.8Z"
        fill={yellow}
      />
    </>
  );
}

/// An operating system's own mark, so a download is recognised at a glance. Marks keep
/// their brand colour, except Apple's black, which follows the text colour.
export function BrandIcon({
  brand,
  size = 20,
  colored = true,
  className,
}: {
  brand: Brand;
  size?: number;
  colored?: boolean;
  className?: string;
}) {
  const custom = brand === "windows" || brand === "linux";
  const mark = custom ? null : MARKS[brand];
  const dark = mark?.hex === "000000";
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("shrink-0", mark && (dark || !colored) && "fill-current", className)}
      style={mark && colored && !dark ? { fill: `#${mark.hex}` } : undefined}
    >
      {brand === "windows" && <WindowsMark colored={colored} />}
      {brand === "linux" && <LinuxMark colored={colored} />}
      {mark && <path d={mark.path} />}
    </svg>
  );
}
