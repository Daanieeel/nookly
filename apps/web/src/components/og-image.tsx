import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";

export const OG_SIZE = { width: 1200, height: 630 };

/// The picture links to the site show when shared: the hearth's flame on the icon's warm
/// dark background, with the hero's headline. Drawn at build time.
export async function ogImage(locale: Locale): Promise<ImageResponse> {
  const t = dictionary(locale).hero;
  const flame = await readFile(join(process.cwd(), "src/assets/og-flame.png"));
  const src = `data:image/png;base64,${flame.toString("base64")}`;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 88px",
        background: "linear-gradient(160deg, #1f130d 0%, #58301a 100%)",
        color: "#fff7ef",
        position: "relative",
      }}
    >
      {/* oxlint-disable-next-line nextjs/no-img-element -- satori draws plain img only */}
      <img
        src={src}
        alt=""
        width={558}
        height={409}
        style={{ position: "absolute", right: 40, bottom: 0 }}
      />
      <div style={{ fontSize: 34, opacity: 0.7, marginBottom: 24 }}>Nookly</div>
      <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
        {t.title1}
      </div>
      <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
        {t.title2}
      </div>
    </div>,
    OG_SIZE,
  );
}
