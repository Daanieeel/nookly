import { describe, expect, it } from "vitest";
import { qrCode } from "./qr.ts";

describe("the QR code of an authenticator link", () => {
  const link = "otpauth://totp/Nookly:ada?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Nookly";

  it("is a square of dark and light modules", () => {
    const { size, dark } = qrCode(link);
    expect(size).toBeGreaterThanOrEqual(21);
    expect(dark).toHaveLength(size * size);
  });

  it("starts with the finder pattern every scanner looks for", () => {
    const { size, dark } = qrCode(link);
    const row = dark.slice(0, 7);
    expect(row.every(Boolean)).toBe(true);
    expect(dark[7]).toBe(false);
    expect(dark.slice(size - 7, size).every(Boolean)).toBe(true);
  });

  it("is the same for the same link and different for another", () => {
    expect(qrCode(link).dark).toEqual(qrCode(link).dark);
    expect(qrCode(`${link}x`).dark).not.toEqual(qrCode(link).dark);
  });
});
