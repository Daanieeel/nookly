import {
  automaticWeekStart,
  resolveWeekStart,
  startOfWeek,
  addDaysTo,
  type WeekStart,
} from "@nookly/shared/calendar-grid";
import { IconClockEdit, IconClockPlus, IconPin } from "@tabler/icons-react-native";
import { z } from "zod";
import { useSetting } from "../data/settings.ts";
import { localDay } from "../screens/dates.ts";
import type { ListFilter } from "./ListControls.tsx";
import type { Option } from "./sheet/OptionList.tsx";

/// Pinned, Created and Updated: every item has them, so every list offers them (D73), with
/// the desktop's options.

export const AGE_OPTIONS: Option<string>[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "last", label: "Last week" },
  { id: "earlier", label: "Earlier" },
];

const PINNED_OPTIONS: Option<string>[] = [
  { id: "pinned", label: "Pinned" },
  { id: "unpinned", label: "Not pinned" },
];

/// What is picked of each; a list keeps it with its other filters. Saved displays from before
/// these existed read as nothing picked.
export const ENTITY_FILTER_PICKS = {
  pinned: z.array(z.string()).default([]),
  created: z.array(z.string()).default([]),
  updated: z.array(z.string()).default([]),
};

const entityFiltersSchema = z.object(ENTITY_FILTER_PICKS);

export type EntityFilterState = z.infer<typeof entityFiltersSchema>;

export const ENTITY_FILTERS_NONE: EntityFilterState = { pinned: [], created: [], updated: [] };

/// Where a moment falls from this week, as the desktop's `ageBucket`.
export function ageBucket(iso: string, weekStart: WeekStart, now = new Date()): string {
  const today = localDay(now);
  const day = localDay(new Date(iso));
  if (day === today) return "today";
  const thisWeek = startOfWeek(today, weekStart);
  if (day >= thisWeek) return "week";
  return day >= addDaysTo(thisWeek, -7) ? "last" : "earlier";
}

interface Dated {
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export function passesEntityFilters(
  item: Dated,
  state: EntityFilterState,
  weekStart: WeekStart,
  now = new Date(),
): boolean {
  const picks = (values: string[], value: string) => values.length === 0 || values.includes(value);
  return (
    picks(state.pinned, item.pinned ? "pinned" : "unpinned") &&
    picks(state.created, ageBucket(item.createdAt, weekStart, now)) &&
    picks(state.updated, ageBucket(item.updatedAt, weekStart, now))
  );
}

/// The first day of the week the settings ask for.
export function useWeekStart(): WeekStart {
  const [setting] = useSetting("calendar.weekStart");
  const [dateFormat] = useSetting("general.dateFormat");
  return resolveWeekStart(setting, automaticWeekStart(dateFormat));
}

/// The three fields for a list's Filter sheet, and whether an item passes them.
export function useEntityFilters(
  state: EntityFilterState,
  onChange: (next: EntityFilterState) => void,
) {
  const weekStart = useWeekStart();
  const fields: ListFilter[] = [
    {
      label: "Pinned",
      icon: IconPin,
      options: PINNED_OPTIONS,
      values: state.pinned,
      onChange: (pinned) => onChange({ ...state, pinned }),
    },
    {
      label: "Created",
      icon: IconClockPlus,
      options: AGE_OPTIONS,
      values: state.created,
      onChange: (created) => onChange({ ...state, created }),
    },
    {
      label: "Updated",
      icon: IconClockEdit,
      options: AGE_OPTIONS,
      values: state.updated,
      onChange: (updated) => onChange({ ...state, updated }),
    },
  ];
  return {
    fields,
    passes: (item: Dated) => passesEntityFilters(item, state, weekStart),
  };
}
