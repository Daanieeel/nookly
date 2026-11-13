import type { Icon as TablerIcon } from "@tabler/icons-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { IconBadge } from "../../ui/kit/IconBadge.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { useScheme, useSemantic } from "../../ui/kit/scheme.ts";
import { BADGE, CORNER, RADIUS, SPACE, TINT, type TintName } from "../../ui/tokens.ts";

/// The desktop's settings cards (Account, Backup, Connections), for the phone: each says
/// what it is about, how it is doing, and what can be done about it. Drawn as a surface of
/// an iOS grouped page; the desktop puts the actions at the head's right, on a phone they
/// get a row of their own under it.

export type CardTone = "ok" | "idle" | "busy" | "caution" | "error";

const TONE_TINT = {
  ok: "blue",
  idle: "gray",
  busy: "gray",
  caution: "yellow",
  error: "red",
} as const satisfies Record<CardTone, TintName>;

/// The colour of a card's line under its title: green when all is well.
const DETAIL_TINT = {
  ok: "green",
  idle: null,
  busy: null,
  caution: "yellow",
  error: "red",
} as const satisfies Record<CardTone, TintName | null>;

/// The surface every card shares, with a red edge when something is wrong.
export function SettingsCard({ tone, children }: { tone?: CardTone; children: ReactNode }) {
  const surface = useSemantic("surface");
  const scheme = useScheme();
  return (
    <View
      style={[
        CORNER,
        {
          gap: SPACE.md,
          padding: SPACE.lg,
          borderRadius: RADIUS.section,
          backgroundColor: surface,
          borderWidth: tone === "error" ? 1 : 0,
          borderColor: TINT.red[scheme],
        },
      ]}
    >
      {children}
    </View>
  );
}

/// A card's head: its icon in a badge tinted by how it is doing, a title, a line under it.
export function CardHead({
  icon: Icon,
  tone,
  title,
  detail,
  badge,
}: {
  icon: TablerIcon;
  tone: CardTone;
  title: string;
  detail?: string;
  /// Beside the title ("This device").
  badge?: ReactNode;
}) {
  const scheme = useScheme();
  const color = TINT[TONE_TINT[tone]][scheme];
  const detailTint = DETAIL_TINT[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
      <IconBadge
        tint={TONE_TINT[tone]}
        size={BADGE.size + 8}
        icon={<Icon size={20} color={color} />}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm }}
        >
          <Label weight="600" numberOfLines={1}>
            {title}
          </Label>
          {badge}
        </View>
        {detail ? (
          <Label
            type="subheadline"
            color="secondaryLabel"
            tint={detailTint ? TINT[detailTint][scheme] : undefined}
            accessibilityLiveRegion="polite"
          >
            {detail}
          </Label>
        ) : null}
      </View>
    </View>
  );
}

/// A card's actions, in a row under its head.
export function CardActions({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm }}>
      {children}
    </View>
  );
}

/// A quiet line under a hairline at the bottom of a card.
export function CardFoot({ children }: { children: ReactNode }) {
  const separator = useSemantic("separator");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.sm,
        borderTopWidth: 0.5,
        borderTopColor: separator,
        paddingTop: SPACE.md,
      }}
    >
      {children}
    </View>
  );
}
