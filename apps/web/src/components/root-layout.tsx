import "@nookly/ui/fonts";
import "@/app/globals.css";
import type { ReactNode } from "react";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import type { Locale } from "@/lib/i18n";
import { ThemeScript } from "./theme-script";

/// The `<html>` of one language. English and German each have their own root layout, so
/// every page says which language it is in.
export function RootLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-background text-foreground">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
