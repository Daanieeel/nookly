import {
  TIMEZONE_COUNTRY,
  countryForTimezone,
  countryNameForTimezone,
} from "@nookly/frontend/lib/timezone-countries";
import { IconWorld } from "@tabler/icons-react-native";
import { Text } from "react-native";
import { useSemanticPair } from "../../ui/kit/scheme.ts";
import type { Option } from "../../ui/sheet/OptionList.tsx";

/// A country's flag as the system draws it (`DE` → 🇩🇪), `EU` for the European Union. The
/// desktop draws the same flags from images the phone cannot load (D61).
export function flagEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function Flag({ code }: { code: string }) {
  return (
    <Text allowFontScaling={false} style={{ fontSize: 18, lineHeight: 22 }}>
      {flagEmoji(code)}
    </Text>
  );
}

function World() {
  return <IconWorld size={18} color={useSemanticPair("secondaryLabel").hex} />;
}

/// Every zone the phone knows. Hermes has no `Intl.supportedValuesOf`, so it is the
/// desktop's own zone table there.
function zones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return Object.keys(TIMEZONE_COUNTRY).sort();
  }
}

const systemZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/// Big hubs across the world, listed first, as on the desktop.
const COMMON = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function zoneOption(tz: string, section: string): Option {
  const code = countryForTimezone(tz);
  const country = countryNameForTimezone(tz);
  return {
    id: tz,
    label: tz.replace(/_/g, " "),
    subtitle: country,
    keywords: [tz, ...(country ? [country] : [])],
    icon: code ? <Flag code={code} /> : undefined,
    section,
  };
}

/// The time zone choices: the system's own first, then the common ones, then every zone.
export function timezoneOptions(): Option[] {
  const system = systemZone();
  const all = zones();
  const common = COMMON.filter((tz) => all.includes(tz));
  const code = countryForTimezone(system);
  return [
    {
      id: "system",
      label: `System (${system.replace(/_/g, " ")})`,
      keywords: ["system", system],
      icon: code ? <Flag code={code} /> : undefined,
    },
    ...common.map((tz) => zoneOption(tz, "Common")),
    ...all.filter((tz) => !common.includes(tz)).map((tz) => zoneOption(tz, "All time zones")),
  ];
}

/// The date and time formats, worded and flagged as the desktop's.
export function formatOptions(kind: "date" | "time"): Option[] {
  return [
    {
      id: "american",
      label: kind === "date" ? "American (MM/DD/YYYY)" : "American (12 hour)",
      icon: <Flag code="US" />,
    },
    {
      id: "european",
      label: kind === "date" ? "European (DD.MM.YYYY)" : "European (24 hour)",
      icon: <Flag code="EU" />,
    },
    { id: "timezone", label: "Follow time zone", icon: <World /> },
  ];
}
