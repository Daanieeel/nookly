import { Children, Fragment, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { BADGE, CORNER, GUTTER, RADIUS, SPACE } from "../tokens.ts";
import { Label } from "./Label.tsx";
import { useSemantic } from "./scheme.ts";

/// Where a row's hairline starts: under its text, past a badge when rows have one.
export const INSET = { plain: GUTTER, badge: GUTTER + BADGE.size + SPACE.md } as const;

/// A section's title above it, small and muted as iOS writes them.
export function SectionHeader({ title, sticky = false }: { title: string; sticky?: boolean }) {
  const background = useSemantic(sticky ? "surface" : "groupedBackground");
  return (
    <View
      style={{
        paddingHorizontal: GUTTER,
        paddingTop: SPACE.lg,
        paddingBottom: SPACE.xs + 2,
        backgroundColor: sticky ? background : undefined,
      }}
    >
      <Label type="footnote" color="secondaryLabel" weight="500" accessibilityRole="header">
        {title.toUpperCase()}
      </Label>
    </View>
  );
}

/// Rows grouped on a raised surface with rounded continuous corners and hairlines between
/// them, inset under the text, as iOS's grouped lists; a title above and a note below.
export function GroupedSection({
  title,
  footer,
  inset = INSET.plain,
  margin = GUTTER,
  onLayout,
  children,
}: {
  /// Room to the screen's edges; 0 where the container has its own (a sheet).
  margin?: number;
  onLayout?: ViewProps["onLayout"];
  title?: string;
  footer?: string;
  /// Where the hairlines start (`INSET.badge` when the rows have badges).
  inset?: number;
  children: ReactNode;
}) {
  const surface = useSemantic("surface");
  const separator = useSemantic("separator");
  const rows = Children.toArray(children);
  return (
    <View style={{ marginHorizontal: margin }} onLayout={onLayout}>
      {title ? <SectionHeader title={title} /> : null}
      <View
        style={[
          CORNER,
          { backgroundColor: surface, borderRadius: RADIUS.section, overflow: "hidden" },
        ]}
      >
        {rows.map((row, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- rows are positional
          <Fragment key={index}>
            {index > 0 ? (
              <View style={{ height: 0.5, marginLeft: inset, backgroundColor: separator }} />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
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
