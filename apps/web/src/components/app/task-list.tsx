import { IconCalendarDue, IconChecklist, IconRepeat, IconSubtask } from "@tabler/icons-react";
import { LIST_ROW_CLASSES } from "@nookly/frontend/classes";
import { cn } from "@nookly/ui/lib/utils";
import { samples } from "@/content/samples";
import type { Locale } from "@/lib/i18n";
import { StatusIcon } from "./status-icon";

/// The Tasks list as the desktop groups it: one header per status with its count, then
/// rows with the status, key, title, labels and due day.
export function TaskListMock({ locale, className }: { locale: Locale; className?: string }) {
  const s = samples(locale).tasks;
  return (
    <div aria-hidden className={cn("flex flex-col text-sm select-none", className)}>
      <div className="flex h-11 items-center gap-2 border-b border-border px-4 font-medium">
        <IconChecklist size={16} className="text-muted-foreground" />
        {s.title}
      </div>
      {s.groups.map((group) => (
        <div key={group.name}>
          <div className="flex h-8 items-center gap-2 bg-muted/60 px-4 text-xs font-medium">
            <StatusIcon status={group.status} />
            {group.name}
            <span className="text-muted-foreground tabular-nums">{group.items.length}</span>
          </div>
          {group.items.map((item) => (
            <div
              key={item.key}
              className={cn(LIST_ROW_CLASSES, "gap-2.5 px-4 hover:bg-transparent")}
            >
              <StatusIcon status={group.status} />
              <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {item.key}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  group.status === "done" && "text-muted-foreground",
                )}
              >
                {item.title}
              </span>
              {"sub" in item && item.sub && (
                <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <IconSubtask size={13} />
                  {item.sub}
                </span>
              )}
              {"repeat" in item && item.repeat && (
                <IconRepeat size={13} className="text-muted-foreground" />
              )}
              <span className="hidden h-5 items-center gap-1 rounded-sm border border-border px-1.5 text-xs text-muted-foreground sm:inline-flex">
                <span className="size-1.5 rounded-full bg-accent-purple" />
                {item.label}
              </span>
              {"due" in item && item.due && (
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-foreground/10 px-1.5 text-xs text-muted-foreground">
                  <IconCalendarDue size={13} />
                  {item.due}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
