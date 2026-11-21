import { Children, type ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useSectionRadius } from "../sheet/in-sheet.ts";
import { CORNER, GUTTER, SPACE, elevation } from "../tokens.ts";
import { Label } from "./Label.tsx";
import { useScheme, useSemantic, useSurface } from "./scheme.ts";

/// A section's title above it, small and muted.
export function SectionHeader({ title, sticky = false }: { title: string; sticky?: boolean }) {
  const background = useSemantic(sticky ? "surface" : "groupedBackground");
  return (
    <View
      style={{
        paddingHorizontal: SPACE.xs,
        paddingTop: SPACE.lg,
        paddingBottom: SPACE.sm,
        backgroundColor: sticky ? background : undefined,
      }}
    >
      <Label
        type="footnote"
        color="secondaryLabel"
        weight="500"
        accessibilityRole="header"
        accessibilityLabel={title}
      >
        {title}
      </Label>
    </View>
  );
}

/// Rows as cards: each one on its own raised surface with rounded continuous corners and a
/// little room between, under a title and above a note. Nothing joins the rows into one
/// slab with hairlines, so a row is the same thing alone and in a list.
export function GroupedSection({
  title,
  footer,
  margin = GUTTER,
  onLayout,
  children,
}: {
  /// Room to the screen's edges; 0 where the container has its own (a sheet).
  margin?: number;
  onLayout?: ViewProps["onLayout"];
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);
  return (
    <View style={{ marginHorizontal: margin }} onLayout={onLayout}>
      {title ? <SectionHeader title={title} /> : null}
      <View style={{ gap: SPACE.sm }}>
        {rows.map((row, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- rows are positional
          <RowCard key={index}>{row}</RowCard>
        ))}
      </View>
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

/// One row on its own raised card.
function RowCard({ children }: { children: ReactNode }) {
  const surface = useSurface();
  const radius = useSectionRadius();
  const scheme = useScheme();
  const edge = useSemantic("separator");
  return (
    <View
      style={[
        CORNER,
        elevation("card", scheme),
        {
          backgroundColor: surface,
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: edge,
          overflow: "hidden",
        },
      ]}
    >
      {children}
    </View>
  );
}
