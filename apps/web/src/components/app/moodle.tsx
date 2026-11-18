import { IconFile } from "@tabler/icons-react";
import { badgeVariants } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";
import { samples } from "@/content/samples";
import type { Locale } from "@/lib/i18n";

/// The Moodle module's course list: each course with what changed and what is due.
export function MoodleMock({ locale, className }: { locale: Locale; className?: string }) {
  const s = samples(locale).moodle;
  return (
    <div aria-hidden className={cn("flex flex-col text-sm select-none", className)}>
      <div className="flex h-11 items-center gap-2 border-b border-border px-4 font-medium">
        {/* oxlint-disable-next-line nextjs/no-img-element -- a static export has no image server */}
        <img src="/brands/moodle.svg" alt="" className="size-4" />
        {s.title}
        <span className={cn(badgeVariants({ variant: "neutral", size: "sm" }), "ml-auto")}>
          {s.readOnly}
        </span>
      </div>
      {s.courses.map((course) => (
        <div
          key={course.name}
          className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-moodle/12 text-brand-moodle">
            <IconFile size={16} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-medium">{course.name}</span>
            <span className="truncate text-xs text-muted-foreground">{course.detail}</span>
          </span>
          <span className={cn(badgeVariants({ variant: "warning", size: "sm" }), "shrink-0")}>
            {course.badge}
          </span>
        </div>
      ))}
    </div>
  );
}
