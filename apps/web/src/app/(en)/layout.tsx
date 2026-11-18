import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootLayout } from "@/components/root-layout";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = { metadataBase: new URL(SITE_URL) };

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <RootLayout locale="en">{children}</RootLayout>;
}
