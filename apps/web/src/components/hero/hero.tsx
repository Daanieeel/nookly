import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { DownloadButton } from "../download-button";
import { HeroStage } from "./stage";
import { Flame } from "./flame";
import { BetaNote } from "./beta-note";

export function Hero({ locale }: { locale: Locale }) {
  const t = dictionary(locale).hero;
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-32 text-center sm:pt-40">
        <Flame className="mb-8" />
        <h1 className="animate-[fade-up_0.7s_ease-out_both] font-display text-[clamp(2.6rem,7vw,4.6rem)] leading-[1.02] font-semibold text-balance">
          {t.title1}
          <br />
          {t.title2}
        </h1>
        <p className="mt-5 max-w-xl animate-[fade-up_0.7s_ease-out_0.1s_both] text-base text-pretty text-muted-foreground sm:text-lg">
          {t.subtitle}
        </p>
        <div className="relative mt-8 animate-[fade-up_0.7s_ease-out_0.2s_both]">
          <DownloadButton locale={locale} />
          <BetaNote label={t.beta} />
        </div>
      </div>
      <div className="relative z-10 mt-16 px-6 pb-24 sm:px-12 sm:pb-32 lg:px-20 xl:px-28">
        <HeroStage locale={locale} />
      </div>
    </section>
  );
}
