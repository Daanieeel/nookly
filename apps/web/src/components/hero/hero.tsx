import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { latestRelease } from "@/lib/releases";
import { DownloadButton } from "../download-button";
import { QueueDemo } from "./queue-demo";
import { Hearth } from "./hearth";

export async function Hero({ locale }: { locale: Locale }) {
  const t = dictionary(locale).hero;
  const release = await latestRelease();
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-20 text-center sm:pt-28">
        <h1 className="animate-[fade-up_0.7s_ease-out_both] font-display text-[clamp(2.6rem,7vw,4.6rem)] leading-[1.02] font-semibold text-balance">
          {t.title1}
          <br />
          {t.title2}
        </h1>
        <p className="mt-5 max-w-xl animate-[fade-up_0.7s_ease-out_0.1s_both] text-base text-pretty text-muted-foreground sm:text-lg">
          {t.subtitle}
        </p>
        <div className="mt-8 animate-[fade-up_0.7s_ease-out_0.2s_both]">
          <DownloadButton locale={locale} release={release} />
        </div>
      </div>
      <div className="relative mt-6">
        <Hearth scene="hero" className="h-[640px]" />
        <div className="absolute inset-x-0 top-[230px] z-10 px-4">
          <QueueDemo locale={locale} />
        </div>
      </div>
    </section>
  );
}
