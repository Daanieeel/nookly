import { toQR } from "toqr";

/// A QR code as a square of modules, `dark[y * size + x]`, for a screen to draw. It has no
/// quiet zone around it: the screen leaves that margin.
export interface QrCode {
  size: number;
  dark: boolean[];
}

export function qrCode(text: string): QrCode {
  const modules = toQR(text);
  return { size: Math.round(Math.sqrt(modules.length)), dark: Array.from(modules, (m) => m === 1) };
}
