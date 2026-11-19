import { IconBrandWindowsFilled } from "@tabler/icons-react";
import { siApple, siAppstore, siDebian, siFedora, siLinux, siUbuntu } from "simple-icons";
import { cn } from "@nookly/ui/lib/utils";

const MARKS = {
  apple: siApple,
  appstore: siAppstore,
  debian: siDebian,
  fedora: siFedora,
  linux: siLinux,
  ubuntu: siUbuntu,
} as const;

export type Brand = keyof typeof MARKS | "windows";

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
  if (brand === "windows") {
    return (
      <IconBrandWindowsFilled
        size={size}
        aria-hidden
        className={cn("shrink-0", colored && "text-[#0078d4]", className)}
      />
    );
  }
  const mark = MARKS[brand];
  const dark = mark.hex === "000000";
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("shrink-0", (dark || !colored) && "fill-current", className)}
      style={colored && !dark ? { fill: `#${mark.hex}` } : undefined}
    >
      <path d={mark.path} />
    </svg>
  );
}
