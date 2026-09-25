import { IconWorld } from "@tabler/icons-react";
import Flag from "react-flagpack";
import "react-flagpack/dist/style.css";
import euFlag from "#/assets/flag-eu.svg";
import { SelectField, type SelectFieldOption } from "#/components/select-field.tsx";
import {
  type FormatMode,
  formatDate,
  formatTime,
  listTimezones,
  systemTimezone,
  useDateTimeSettings,
} from "#/lib/datetime.ts";
import {
  countryForTimezone,
  countryNameForTimezone,
  flagAssetCode,
} from "#/lib/timezone-countries.ts";

// Neither the runtime's zone list nor the OS zone changes while the app runs.
const TIMEZONES = listTimezones();
const SYSTEM_TIMEZONE = systemTimezone();

function FlagIcon({ code }: { code: string }) {
  return <Flag code={code} size="s" hasBorder={false} />;
}

/// react-flagpack ships no European Union flag, so it's drawn from a bundled
/// asset at the same size as the pack's small flags (Twemoji artwork, cropped).
function EuFlagIcon() {
  return <img src={euFlag} alt="" className="inline-block h-3 w-4 shrink-0 object-cover" />;
}

function timezoneIcon(tz: string) {
  const code = countryForTimezone(tz);
  // A globe for zones missing from the table, so no option has an empty slot.
  return code ? (
    <FlagIcon code={flagAssetCode(code)} />
  ) : (
    <IconWorld size={14} className="text-muted-foreground" />
  );
}

function timezoneOption(tz: string): SelectFieldOption {
  const country = countryNameForTimezone(tz);
  return {
    value: tz,
    label: tz.replace(/_/g, " "),
    keywords: country ? [country] : [],
    icon: timezoneIcon(tz),
  };
}

// Big hubs across the world, shown above the full list. Each lists every spelling
// engines might report for it.
const COMMON_CANDIDATES = [
  ["America/New_York"],
  ["America/Chicago"],
  ["America/Denver"],
  ["America/Los_Angeles"],
  ["Europe/London"],
  ["Europe/Berlin"],
  ["Europe/Paris"],
  ["Asia/Kolkata", "Asia/Calcutta"],
  ["Asia/Shanghai"],
  ["Asia/Tokyo"],
  ["Australia/Sydney"],
];
const TIMEZONE_SET = new Set(TIMEZONES);
const COMMON = COMMON_CANDIDATES.map((c) => c.find((tz) => TIMEZONE_SET.has(tz))).filter(
  (tz) => tz !== undefined,
);
const COMMON_SET = new Set(COMMON);

const TIMEZONE_OPTIONS: SelectFieldOption[] = [
  {
    value: "system",
    label: `System (${SYSTEM_TIMEZONE.replace(/_/g, " ")})`,
    keywords: ["system", SYSTEM_TIMEZONE, countryNameForTimezone(SYSTEM_TIMEZONE) ?? ""],
    icon: timezoneIcon(SYSTEM_TIMEZONE),
  },
  ...COMMON.map((tz, i) => ({ ...timezoneOption(tz), separatorBefore: i === 0 })),
  ...TIMEZONES.filter((tz) => !COMMON_SET.has(tz)).map((tz, i) => ({
    ...timezoneOption(tz),
    separatorBefore: i === 0,
  })),
];

const MODE_ICON = {
  american: <FlagIcon code="US" />,
  european: <EuFlagIcon />,
  timezone: <IconWorld size={14} className="text-muted-foreground" />,
} satisfies Record<FormatMode, React.ReactNode>;

const DATE_FORMAT_OPTIONS: SelectFieldOption[] = [
  { value: "american", label: "American (MM/DD/YYYY)", icon: MODE_ICON.american },
  { value: "european", label: "European (DD.MM.YYYY)", icon: MODE_ICON.european },
  { value: "timezone", label: "Follow time zone", icon: MODE_ICON.timezone },
];

const TIME_FORMAT_OPTIONS: SelectFieldOption[] = [
  { value: "american", label: "American (12 hour)", icon: MODE_ICON.american },
  { value: "european", label: "European (24 hour)", icon: MODE_ICON.european },
  { value: "timezone", label: "Follow time zone", icon: MODE_ICON.timezone },
];

function asMode(value: string): FormatMode {
  return value === "american" || value === "european" ? value : "timezone";
}

/// Time zone, date format and time format, with a live preview of the result.
export function DateTimeSettings() {
  const { timezone, dateFormat, timeFormat, update } = useDateTimeSettings();
  const now = new Date().toISOString();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">Date and time</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(now)}, {formatTime(now)}
        </span>
      </div>
      <SettingRow label="Time zone">
        <SelectField
          aria-label="Time zone"
          searchable
          searchPlaceholder="Search time zones…"
          options={TIMEZONE_OPTIONS}
          value={timezone}
          onChange={(value) => update({ timezone: value })}
        />
      </SettingRow>
      <SettingRow label="Date format">
        <SelectField
          aria-label="Date format"
          options={DATE_FORMAT_OPTIONS}
          value={dateFormat}
          onChange={(value) => update({ dateFormat: asMode(value) })}
        />
      </SettingRow>
      <SettingRow label="Time format">
        <SelectField
          aria-label="Time format"
          options={TIME_FORMAT_OPTIONS}
          value={timeFormat}
          onChange={(value) => update({ timeFormat: asMode(value) })}
        />
      </SettingRow>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
