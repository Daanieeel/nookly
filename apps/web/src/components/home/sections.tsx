import type { ComponentType, ReactNode } from "react";
import {
  IconBook2,
  IconCheck,
  IconChecklist,
  IconChevronDown,
  IconCode,
  IconFileExport,
  IconLock,
  IconNotes,
  IconSchool,
  IconWifiOff,
  IconEyeOff,
} from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { latestRelease } from "@/lib/releases";
import { AppFrame } from "../app/frame";
import { DevicesMock } from "../app/devices";
import { MoodleMock } from "../app/moodle";
import { NotePageMock } from "../app/note-page";
import { PaletteMock } from "../app/palette";
import { SemesterMock } from "../app/semester";
import { TaskListMock } from "../app/task-list";
import { TerminalMock } from "../app/terminal";
import { DownloadButton } from "../download-button";
import { Hearth } from "../hero/hearth";

const SECTION = "mx-auto w-full max-w-6xl px-4 sm:px-6";

function Heading({
  eyebrow,
  title,
  body,
  className,
  id,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", className)}>
      {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
      <h2
        id={id}
        className="font-display text-[clamp(2rem,4.4vw,3.1rem)] leading-[1.05] font-semibold text-balance"
      >
        {title}
      </h2>
      {body && (
        <p className="text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          {body}
        </p>
      )}
    </div>
  );
}

export function Intro({ locale }: { locale: Locale }) {
  const t = dictionary(locale).intro;
  return (
    <section className="bg-card py-24 sm:py-32">
      <div className={SECTION}>
        <Heading eyebrow={t.eyebrow} title={t.title} body={t.body} />
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  children,
  className,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-background",
        className,
      )}
    >
      <div className="flex flex-col gap-2 p-6 sm:p-8">
        <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-card">
          <Icon size={18} className="text-muted-foreground" />
        </span>
        <h3 className="mt-2 font-display text-xl font-semibold">{title}</h3>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {/* The app screen rises out of the card's bottom edge and fades into it. */}
      <div className="relative mt-auto px-6 sm:px-8 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
        <div className="translate-y-2 transition-transform duration-500 ease-out group-hover:translate-y-0">
          {children}
        </div>
      </div>
    </article>
  );
}

export function Features({ locale }: { locale: Locale }) {
  const t = dictionary(locale).features;
  const sampleSpace = locale === "de" ? "Studium" : "Studies";
  return (
    <section id="features" className="scroll-mt-20 bg-card pb-24 sm:pb-32">
      <div className={cn(SECTION, "flex flex-col gap-12")}>
        <Heading eyebrow={t.eyebrow} title={t.title} />
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureCard icon={IconChecklist} title={t.tasks.title} body={t.tasks.body}>
            <AppFrame icon={<IconChecklist />} title={sampleSpace} className="h-[300px]">
              <TaskListMock locale={locale} />
            </AppFrame>
          </FeatureCard>
          <FeatureCard icon={IconNotes} title={t.notes.title} body={t.notes.body}>
            <AppFrame icon={<IconNotes />} title={sampleSpace} className="h-[300px]">
              <NotePageMock locale={locale} />
            </AppFrame>
          </FeatureCard>
          <FeatureCard icon={IconBook2} title={t.studies.title} body={t.studies.body}>
            <AppFrame icon={<IconBook2 />} title={sampleSpace} className="h-[300px]">
              <SemesterMock locale={locale} />
            </AppFrame>
          </FeatureCard>
          <FeatureCard icon={IconSchool} title={t.moodle.title} body={t.moodle.body}>
            <AppFrame icon={<IconSchool />} title={sampleSpace} className="h-[300px]">
              <MoodleMock locale={locale} />
            </AppFrame>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

export function Keyboard({ locale }: { locale: Locale }) {
  const t = dictionary(locale).keyboard;
  return (
    <section className="bg-background py-24 sm:py-32">
      <div className={cn(SECTION, "grid items-center gap-12 md:grid-cols-[1fr_1.1fr]")}>
        <Heading title={t.title} body={t.body} />
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--accent-blue)_16%,transparent),transparent)]"
          />
          <div className="relative">
            <PaletteMock locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Agents({ locale }: { locale: Locale }) {
  const t = dictionary(locale).agents;
  return (
    <section className="bg-card py-24 sm:py-32">
      <div className={cn(SECTION, "grid items-center gap-12 md:grid-cols-[1.1fr_1fr]")}>
        <TerminalMock locale={locale} className="order-last md:order-first" />
        <div className="flex flex-col gap-6">
          <Heading eyebrow={t.eyebrow} title={t.title} body={t.body} />
          <ul className="flex flex-col gap-3">
            {t.points.map((point) => (
              <li key={point} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-positive/15 text-positive">
                  <IconCheck size={12} stroke={2.5} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Sync({ locale }: { locale: Locale }) {
  const t = dictionary(locale).sync;
  return (
    <section className="bg-background py-24 sm:py-32">
      <div className={cn(SECTION, "grid items-center gap-12 md:grid-cols-2")}>
        <Heading eyebrow={t.eyebrow} title={t.title} body={t.body} />
        <DevicesMock locale={locale} className="pt-2" />
      </div>
    </section>
  );
}

const PRIVACY_ICONS = [IconWifiOff, IconEyeOff, IconFileExport, IconCode];

export function Privacy({ locale }: { locale: Locale }) {
  const t = dictionary(locale).privacy;
  return (
    <section className="relative overflow-hidden bg-[#151210] px-4 py-16 text-white sm:px-6 sm:py-20">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(45%_80%_at_50%_100%,rgba(255,122,58,0.28),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="relative flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <IconLock size={22} className="text-[#ffb27a]" />
          </span>
          <h2 className="mt-6 font-display text-[clamp(2rem,4.4vw,3.1rem)] leading-tight font-semibold">
            {t.title}
          </h2>
          <p className="mt-3 max-w-xl text-base text-white/60 sm:text-lg">{t.body}</p>
        </div>
        <div className="relative mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {t.points.map((point, i) => {
            // SAFETY: four points, four icons.
            const Icon = PRIVACY_ICONS[i]!;
            return (
              <div key={point.title} className="flex flex-col gap-2 bg-[#151210] p-6">
                <Icon size={18} className="text-[#ffb27a]" />
                <h3 className="mt-1 text-sm font-medium">{point.title}</h3>
                <p className="text-sm text-white/60">{point.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Faq({ locale }: { locale: Locale }) {
  const t = dictionary(locale).faq;
  return (
    <section id="faq" className="scroll-mt-20 bg-card py-24 sm:py-32">
      <div className={cn(SECTION, "grid gap-12 md:grid-cols-[1fr_1.5fr]")}>
        <Heading title={t.title} />
        <div className="flex flex-col">
          {t.items.map((item) => (
            <details
              key={item.q}
              className="group border-b border-border py-1 [&::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <IconChevronDown
                  size={18}
                  aria-hidden
                  className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function Closing({ locale }: { locale: Locale }) {
  const t = dictionary(locale).closing;
  const release = await latestRelease();
  return (
    <section className="relative overflow-hidden bg-background pt-24 sm:pt-32">
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-4 text-center">
        <h2 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.05] font-semibold text-balance">
          {t.title}
        </h2>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">{t.body}</p>
        <div className="mt-8">
          <DownloadButton locale={locale} release={release} />
        </div>
      </div>
      <Hearth scene="closing" className="mt-6 h-[320px]" />
    </section>
  );
}

/// The FAQ as structured data, so search engines can show the answers.
export function FaqJsonLd({ locale }: { locale: Locale }) {
  const t = dictionary(locale).faq;
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      // oxlint-disable-next-line react/no-danger -- our own static text, serialised
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
