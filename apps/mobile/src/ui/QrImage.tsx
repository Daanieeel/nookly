import { qrCode } from "@nookly/shared/qr";
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

/// A QR code a scanner reads: dark modules on a white square with its quiet margin, the same
/// in both themes.
export function QrImage({
  text,
  label,
  size = 192,
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
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height: size, borderRadius: 12, overflow: "hidden" }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${side} ${side}`}>
        <Rect width={side} height={side} fill="#ffffff" />
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}
