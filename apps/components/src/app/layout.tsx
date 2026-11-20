import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "@nookly/ui/fonts";
import "./globals.css";
import { THEME_KEY } from "@/components/theme";

export const metadata: Metadata = {
  title: "Nookly components",
  description: "Every primitive and small app component of Nookly, in light and dark.",
  robots: { index: false, follow: false },
};

// Sets the theme before the first paint so the page never flashes the wrong one.
const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
