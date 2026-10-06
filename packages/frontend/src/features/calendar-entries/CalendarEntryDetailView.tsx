import { IconRepeat } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DateInput } from "#/components/date-input.tsx";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { PROPERTY_VALUE, PropertyRow } from "#/components/property-row.tsx";
import { TextProperty } from "#/components/property-fields.tsx";
import { Badge } from "@nookly/ui/components/badge";
import { Checkbox } from "@nookly/ui/components/checkbox";
import { TimeInput } from "#/components/time-input.tsx";
import { Textarea } from "@nookly/ui/components/textarea";
import { listCalendarEntries, overrideCalendarEntryOccurrence } from "#/lib/api/calendarEntries.ts";
import type { CalendarEntry, Entity } from "#/lib/api/types.ts";
import { formatTimestamp } from "#/features/tasks/task-model.ts";
import { qk } from "#/lib/query-keys.ts";

/// A calendar entry's page: like Sessions, it's calendar-first (see
/// `CalendarEntriesListView`), but unlike Sessions it also gets a real detail
/// page — a first-class entity needs a Space for Attachments, Mentioned,
/// Mentioned in and Relationships to live somewhere, all supplied generically
/// by `EntityDetailLayout`/`RightSidebar` once the type is registered.
export function CalendarEntryDetailView({ entity }: { entity: Entity }) {
  const { data: entries = [] } = useQuery({
    queryKey: qk.calendarEntries.bySpace(entity.spaceId),
    queryFn: () => listCalendarEntries(entity.spaceId),
  });
  const entry = entries.find((a) => a.entity.id === entity.id);

  return (
    <EntityDetailLayout entity={entity} sidebar={entry && <PropertiesPanel entry={entry} />}>
      <div className="flex w-full flex-col gap-3 pb-24">
        {entry && (
          <Textarea
            aria-label="Description"
            placeholder="Add a description…"
            defaultValue={entry.description ?? ""}
            onBlur={(e) => {
              const next = e.target.value.trim() || null;
              if (next !== entry.description) {
                void overrideCalendarEntryOccurrence(entity.id, { description: next });
              }
            }}
            className="min-h-24 resize-y"
          />
        )}
      </div>
    </EntityDetailLayout>
  );
}

function PropertiesPanel({ entry }: { entry: CalendarEntry }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.calendarEntries.root });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof overrideCalendarEntryOccurrence>[1]) =>
      overrideCalendarEntryOccurrence(entry.entity.id, patch),
    onSuccess: refresh,
  });

  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Date">
        <DateInput
          aria-label="Date"
          clearable={false}
          value={entry.date}
          onChange={(day) => day && save.mutate({ date: day })}
        />
      </PropertyRow>

      <PropertyRow label="All day">
        <div className="flex h-7 items-center px-2">
          <Checkbox
            checked={entry.allDay}
            onCheckedChange={(v) => save.mutate({ allDay: v === true })}
            aria-label="All day"
          />
        </div>
      </PropertyRow>

      {!entry.allDay && (
        <PropertyRow label="Time">
          <div className="flex items-center gap-1.5 px-1">
            <TimeInput
              aria-label="Start time"
              value={entry.startTime ?? "09:00"}
              onChange={(startTime) => save.mutate({ startTime })}
              className="h-7 flex-1"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <TimeInput
              aria-label="End time"
              value={entry.endTime ?? "10:00"}
              onChange={(endTime) => save.mutate({ endTime })}
              className="h-7 flex-1"
            />
          </div>
        </PropertyRow>
      )}

      <PropertyRow label="Location">
        <TextProperty
          value={entry.location}
          onSave={(location) => save.mutate({ location })}
          placeholder="Add location"
          label="Location"
          pending={save.isPending}
          failed={save.isError}
        />
      </PropertyRow>

      {entry.templateId && (
        <PropertyRow label="Repeats">
          <span className={PROPERTY_VALUE}>
            <Badge variant="secondary" className="gap-1">
              <IconRepeat size={12} />
              Recurring series
            </Badge>
          </span>
        </PropertyRow>
      )}

      <PropertyRow label="Created">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(entry.entity.createdAt)}
        </span>
      </PropertyRow>
      <PropertyRow label="Updated">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(entry.entity.updatedAt)}
        </span>
      </PropertyRow>
    </section>
  );
}
