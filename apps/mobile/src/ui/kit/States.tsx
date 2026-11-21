import { IconAlertTriangle } from "@tabler/icons-react-native";
import { ActivityIndicator, View } from "react-native";
import { Button } from "../Button.tsx";
import { CORNER, RADIUS, SPACE, TINT, elevation } from "../tokens.ts";
import { Glyph, type GlyphIcon } from "./Glyph.tsx";
import { Label } from "./Label.tsx";
import { useScheme, useSemantic, useSemanticPair } from "./scheme.ts";

/// The three states every list, picker and page has besides its content: nothing yet,
/// still loading, and failed. Centred, quiet, in the same words everywhere.

/// The mark of a state: an icon on a raised tile, with two more tiles behind it, tilted, like
/// a small stack of cards.
function StateTile({ glyph, color }: { glyph: GlyphIcon; color: string }) {
  const scheme = useScheme();
  const raised = useSemantic("raised");
  const edge = useSemantic("controlEdge");
  const tile = [
    CORNER,
    {
      position: "absolute" as const,
      width: 56,
      height: 56,
      borderRadius: RADIUS.section,
      borderWidth: 1,
      borderColor: edge,
      backgroundColor: raised,
    },
  ];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 56, height: 56, marginBottom: SPACE.xs }}
    >
      <View
        style={[
          ...tile,
          elevation("control", scheme),
          { opacity: 0.7, transform: [{ translateX: -7 }, { rotate: "-12deg" }] },
        ]}
      />
      <View
        style={[
          ...tile,
          elevation("control", scheme),
          { opacity: 0.7, transform: [{ translateX: 7 }, { rotate: "12deg" }] },
        ]}
      />
      <View
        style={[
          ...tile,
          elevation("card", scheme),
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <Glyph icon={glyph} size={26} color={color} />
      </View>
    </View>
  );
}

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
  const mark = useSemanticPair("label");
  return (
    <View
      style={{
        alignItems: "center",
        gap: SPACE.sm,
        paddingVertical: SPACE.section,
        paddingHorizontal: SPACE.xxl,
      }}
    >
      {glyph ? <StateTile glyph={glyph} color={mark.hex} /> : null}
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
      <StateTile glyph={IconAlertTriangle} color={TINT.red[scheme]} />
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
      {onRetry ? <StateAction label="Try Again" onPress={onRetry} quiet /> : null}
    </View>
  );
}

/// The one thing to do about a state, as a button: the main colour for what is missing, a
/// quiet one for a retry.
function StateAction({
  label,
  onPress,
  quiet = false,
}: {
  label: string;
  onPress: () => void;
  quiet?: boolean;
}) {
  return (
    <View style={{ marginTop: SPACE.sm }}>
      <Button label={label} onPress={onPress} variant={quiet ? "secondary" : "default"} />
    </View>
  );
}
