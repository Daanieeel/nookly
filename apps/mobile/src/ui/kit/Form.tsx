import { Children, type ReactNode } from "react";
import { View } from "react-native";
import { useSectionRadius } from "../sheet/in-sheet.ts";
import { CORNER, SPACE, TINT, elevation } from "../tokens.ts";
import { SectionHeader } from "./GroupedSection.tsx";
import { Label } from "./Label.tsx";
import { useRaised, useScheme, useSemantic } from "./scheme.ts";

/// A form's fields, each one its own raised box with a little room between them, as the
/// desktop lays a form out: a title above and a note below. Nothing groups them on a shared
/// surface, so a field is the same thing alone and with others.
export function FormSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  if (Children.count(children) === 0) return null;
  return (
    <View>
      {title ? <SectionHeader title={title} /> : null}
      <View style={{ gap: SPACE.md }}>{children}</View>
      {footer ? (
        <Label
          type="footnote"
          color="secondaryLabel"
          style={{ paddingHorizontal: SPACE.xs, paddingTop: SPACE.sm }}
        >
          {footer}
        </Label>
      ) : null}
    </View>
  );
}

/// A field's box: raised, with a hairline edge and the control's depth, as the desktop's
/// input. An error shows under it in red.
export function FormRow({ error, children }: { error?: string | null; children: ReactNode }) {
  const raised = useRaised();
  const edge = useSemantic("controlEdge");
  const scheme = useScheme();
  const radius = useSectionRadius();
  return (
    <View>
      <View
        testID="form-row"
        style={[
          CORNER,
          elevation("control", scheme),
          {
            backgroundColor: raised,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: error ? TINT.red[scheme] : edge,
            overflow: "hidden",
          },
        ]}
      >
        {children}
      </View>
      {error ? (
        <Label
          type="footnote"
          tint={TINT.red[scheme]}
          accessibilityLiveRegion="polite"
          style={{ paddingHorizontal: SPACE.xs, paddingTop: SPACE.xs + 2 }}
        >
          {error}
        </Label>
      ) : null}
    </View>
  );
}

/// A field's name at the start of its row, with the red star of a required one.
export function RowLabel({ label, required }: { label: string; required?: boolean }) {
  const scheme = useScheme();
  return (
    <Label numberOfLines={1}>
      {label}
      {required ? (
        <Label tint={TINT.red[scheme]} accessibilityLabel="required">
          {" *"}
        </Label>
      ) : null}
    </Label>
  );
}
