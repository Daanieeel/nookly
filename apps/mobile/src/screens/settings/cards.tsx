import type { Icon as TablerIcon } from "@tabler/icons-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { cn } from "../../ui/classes.ts";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";

/// The desktop's settings cards (Account, Backup, Connections), for the phone: each says
/// what it is about, how it is doing, and what can be done about it. The desktop puts the
/// actions at the head's right; on a phone they get a row of their own under it.

export type CardTone = "ok" | "idle" | "busy" | "caution" | "error";

const BADGE = {
  ok: "bg-primary/10",
  idle: "bg-muted",
  busy: "bg-muted",
  caution: "bg-caution/10",
  error: "bg-destructive/10",
} satisfies Record<CardTone, string>;

export const DETAIL_TONE = {
  ok: "positive",
  idle: "muted",
  busy: "muted",
  caution: "caution",
  error: "destructive",
} as const satisfies Record<CardTone, string>;

/// The frame every card shares: a border that turns red when something is wrong.
export function SettingsCard({ tone, children }: { tone?: CardTone; children: ReactNode }) {
  return (
    <View
      className={cn(
        "gap-3 rounded-lg border bg-card p-4",
        tone === "error" ? "border-destructive/50" : "border-border",
      )}
    >
      {children}
    </View>
  );
}

/// A card's head: a round badge with its icon in the tone's colour, a title, a line under it.
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
  const theme = useTheme();
  const color = {
    ok: theme.colors.primary,
    idle: theme.colors.mutedForeground,
    busy: theme.colors.mutedForeground,
    caution: theme.colors.caution,
    error: theme.colors.destructive,
  }[tone];
  return (
    <View className="flex-row items-center gap-3">
      <View className={cn("size-9 items-center justify-center rounded-full", BADGE[tone])}>
        <Icon size={18} color={color} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-medium" numberOfLines={1}>
            {title}
          </Text>
          {badge}
        </View>
        {detail ? (
          <Text variant="small" tone={DETAIL_TONE[tone]} accessibilityLiveRegion="polite">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/// A card's actions, in a row under its head.
export function CardActions({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap items-center gap-2">{children}</View>;
}

/// A quiet line under a divider at the bottom of a card.
export function CardFoot({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 border-t border-border/60 pt-3">{children}</View>
  );
}
