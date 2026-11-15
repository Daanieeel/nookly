import type { Option } from "./sheet/OptionList.tsx";

/// The desktop's date filters (Last edited, Added): rolling windows back from now.
export const DATE_WINDOWS = [
  { id: "today", label: "Past day", days: 1 },
  { id: "week", label: "Past 7 days", days: 7 },
  { id: "month", label: "Past 30 days", days: 30 },
] as const;

export const DATE_WINDOW_OPTIONS: Option<string>[] = DATE_WINDOWS.map((w) => ({
  id: w.id,
  label: w.label,
}));

/// Whether `at` falls in any of the windows picked; none picked lets everything through.
export function withinWindows(at: string, picked: string[], now = Date.now()): boolean {
  if (picked.length === 0) return true;
  return picked.some((id) => {
    const days = DATE_WINDOWS.find((w) => w.id === id)?.days ?? 0;
    return now - Date.parse(at) < days * 86_400_000;
  });
}
