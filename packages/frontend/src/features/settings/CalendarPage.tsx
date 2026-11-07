import { useId } from "react";
import { cn } from "@nookly/ui/lib/utils";
import type { SettingId } from "#/lib/settings/registry.ts";
import { CalendarPreview } from "./CalendarPreview.tsx";
import { CopyIdButton, ResetButton } from "./SettingRow.tsx";
import { ROWS } from "./setting-rows.tsx";

/// A setting as a compact field: the title with its reset, the description, then the control
/// under them. The text and control are the setting's own row, so search, the CLI and every
/// label stay exactly as they are.
function CalendarField({ id, className }: { id: SettingId; className?: string }) {
  const labelId = useId();
  const row = ROWS.find((r) => r.setting === id);
  if (!row) return null;
  return (
    <fieldset
      aria-labelledby={labelId}
      data-setting-id={id}
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <CopyIdButton settingId={id} />
        <div className="flex items-center gap-1.5">
          <span id={labelId} className="text-sm font-medium">
            {row.title}
          </span>
          <ResetButton settingId={id} title={row.title} />
        </div>
        <p className="text-xs text-muted-foreground">{row.description}</p>
      </div>
      {row.control}
    </fieldset>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/// The Calendar page of Settings: a small week that follows every setting below it, with the
/// settings grouped by what they change. The registry rows stay the source of titles, ids and
/// search, so a search result for one of these is still a plain row.
export function CalendarPage() {
  return (
    <div className="flex flex-col gap-6 pb-4">
      <CalendarPreview />
      <Group title="Week and day">
        <CalendarField id="calendar.weekStart" />
        <CalendarField id="calendar.dayStartHour" />
      </Group>
      <Group title="Current day">
        <CalendarField id="calendar.todayColor" />
        <CalendarField id="calendar.todayIntensity" />
      </Group>
      <Group title="New items">
        <CalendarField id="calendar.sessionLengthMinutes" />
        <CalendarField id="calendar.calendarEntryLengthMinutes" />
        <CalendarField id="calendar.snapMinutes" />
      </Group>
    </div>
  );
}
