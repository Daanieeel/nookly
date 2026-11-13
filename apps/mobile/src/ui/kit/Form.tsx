import { Children, createContext, type ReactNode, useContext } from "react";
import { View } from "react-native";
import { CORNER, GUTTER, RADIUS, SPACE, TINT } from "../tokens.ts";
import { GroupedSection } from "./GroupedSection.tsx";
import { Label } from "./Label.tsx";
import { useScheme, useSemantic } from "./scheme.ts";

/// Whether a field sits in a `FormSection`, which draws the surface its rows share.
const InForm = createContext(false);

/// Fields grouped as iOS groups a form's rows (D52): one raised surface, hairlines between
/// them, a title above and a note below.
export function FormSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <InForm.Provider value>
      <GroupedSection title={title} footer={footer} margin={0}>
        {children}
      </GroupedSection>
    </InForm.Provider>
  );
}

/// One field's row: on its own it brings a surface of its own; in a `FormSection` it is one
/// of the section's rows. An error shows under it in red.
export function FormRow({ error, children }: { error?: string | null; children: ReactNode }) {
  const inForm = useContext(InForm);
  const surface = useSemantic("surface");
  const scheme = useScheme();
  const message = error ? (
    <Label
      type="footnote"
      tint={TINT.red[scheme]}
      accessibilityLiveRegion="polite"
      style={{ paddingHorizontal: GUTTER, paddingBottom: SPACE.sm }}
    >
      {error}
    </Label>
  ) : null;
  if (inForm) {
    return (
      <View>
        {children}
        {message}
      </View>
    );
  }
  return (
    <View
      style={[
        CORNER,
        { backgroundColor: surface, borderRadius: RADIUS.section, overflow: "hidden" },
      ]}
    >
      {children}
      {message}
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
