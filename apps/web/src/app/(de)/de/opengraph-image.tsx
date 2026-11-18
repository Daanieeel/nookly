import { OG_SIZE, ogImage } from "@/components/og-image";
import { dictionary } from "@/content";

export const alt = dictionary("de").meta.homeTitle;
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Image() {
  return ogImage("de");
}
