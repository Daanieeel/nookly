import { qrCode } from "@nookly/shared/qr";
import { useMemo } from "react";

/// A QR code as a picture a scanner reads: dark modules on a white square with the quiet
/// margin around it, in both themes.
export function QrImage({
  text,
  label,
  size = 176,
}: {
  text: string;
  label: string;
  size?: number;
}) {
  const code = useMemo(() => qrCode(text), [text]);
  const margin = 4;
  const side = code.size + margin * 2;
  const path = useMemo(() => {
    const parts: string[] = [];
    for (let y = 0; y < code.size; y++) {
      for (let x = 0; x < code.size; x++) {
        if (code.dark[y * code.size + x]) parts.push(`M${x + margin} ${y + margin}h1v1h-1z`);
      }
    }
    return parts.join("");
  }, [code]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${side} ${side}`}
      width={size}
      height={size}
      className="rounded-lg [shape-rendering:crispEdges]"
    >
      <rect width={side} height={side} className="fill-white" />
      <path d={path} className="fill-black" />
    </svg>
  );
}
