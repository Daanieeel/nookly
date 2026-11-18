import { IconAlertTriangle } from "@tabler/icons-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { MIN_TOUCH } from "../touch.ts";
import { SPACE, TINT } from "../tokens.ts";
import { Glyph, type GlyphIcon } from "./Glyph.tsx";
import { Label } from "./Label.tsx";
import { useScheme, useSemantic, useSemanticPair } from "./scheme.ts";

/// The three states every list, picker and page has besides its content: nothing yet,
/// still loading, and failed. Centred, quiet, in the same words everywhere.

export function EmptyState({
  glyph,
  title,
  message,
  action,
}: {
  glyph?: GlyphIcon;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  const muted = useSemanticPair("tertiaryLabel");
  return (
    <View
      style={{
        alignItems: "center",
        gap: SPACE.sm,
        paddingVertical: SPACE.section,
        paddingHorizontal: SPACE.xxl,
      }}
    >
      {glyph ? <Glyph icon={glyph} size={34} color={muted.hex} /> : null}
      <Label
        type="headline"
        accessibilityRole="summary"
        accessibilityLabel={message ? `${title}. ${message}` : title}
        style={{ textAlign: "center" }}
      >
        {title}
      </Label>
      {message ? (
        <Label
          type="subheadline"
          color="secondaryLabel"
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={{ textAlign: "center" }}
        >
          {message}
        </Label>
      ) : null}
      {action ? <StateAction {...action} /> : null}
    </View>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  const muted = useSemantic("secondaryLabel");
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ alignItems: "center", paddingVertical: SPACE.section }}
    >
      <ActivityIndicator color={muted} />
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const scheme = useScheme();
  return (
    <View
      style={{
        alignItems: "center",
        gap: SPACE.sm,
        paddingVertical: SPACE.section,
        paddingHorizontal: SPACE.xxl,
      }}
    >
      <Glyph icon={IconAlertTriangle} size={30} color={TINT.red[scheme]} />
      <Label
        type="headline"
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        accessibilityLabel={message ? `${title}. ${message}` : title}
        style={{ textAlign: "center" }}
      >
        {title}
      </Label>
      {message ? (
        <Label
          type="subheadline"
          color="secondaryLabel"
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={{ textAlign: "center" }}
        >
          {message}
        </Label>
      ) : null}
      {onRetry ? <StateAction label="Try Again" onPress={onRetry} /> : null}
    </View>
  );
}

function StateAction({ label, onPress }: { label: string; onPress: () => void }) {
  const scheme = useScheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH,
        justifyContent: "center",
        paddingHorizontal: SPACE.lg,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Label weight="600" tint={TINT.blue[scheme]}>
        {label}
      </Label>
    </Pressable>
  );
}
