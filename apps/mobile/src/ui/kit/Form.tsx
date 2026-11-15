import { Children, createContext, type ReactNode, useContext } from "react";
import { View } from "react-native";
import { useSectionRadius } from "../sheet/in-sheet.ts";
import { CORNER, GUTTER, SPACE, TINT } from "../tokens.ts";
import { GroupedSection, SectionHeader } from "./GroupedSection.tsx";
import { Label } from "./Label.tsx";
import { useScheme, useSurface } from "./scheme.ts";

/// Whether a field sits in a `FormSection`, which draws the surface its rows share.
const InForm = createContext(false);

/// Whether the caller is a row of a `FormSection` rather than a field on its own.
export function useInForm() {
  return useContext(InForm);
}

/// Fields grouped as iOS groups a form's rows (D52): one raised surface, hairlines between
/// them, a title above and a note below. A section of one field leaves the surface to the
/// field (D69).
export function FormSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;
  // One field on its own draws its own box (a text field's raised box, a select's row).
  if (rows.length === 1) {
    return (
      <View>
        {title ? <SectionHeader title={title} /> : null}
        {children}
        {footer ? (
          <Label
            type="footnote"
            color="secondaryLabel"
            style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm }}
          >
            {footer}
          </Label>
        ) : null}
      </View>
    );
  }
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
  const surface = useSurface();
  const scheme = useScheme();
  const radius = useSectionRadius();
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
      testID="form-row"
      style={[CORNER, { backgroundColor: surface, borderRadius: radius, overflow: "hidden" }]}
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
