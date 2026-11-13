import type { ReactNode } from "react";
import { View } from "react-native";
import { CORNER, RADIUS, SPACE } from "../tokens.ts";
import { SectionHeader } from "./GroupedSection.tsx";
import { useSemantic } from "./scheme.ts";

/// Something that is not a list of rows (a grid, a row of colours) on the same raised,
/// rounded surface as a grouped section, with its title above it.
export function Surface({
  title,
  padding = SPACE.sm,
  children,
}: {
  title?: string;
  padding?: number;
  children: ReactNode;
}) {
  const surface = useSemantic("surface");
  return (
    <View>
      {title ? <SectionHeader title={title} /> : null}
      <View style={[CORNER, { backgroundColor: surface, borderRadius: RADIUS.section, padding }]}>
        {children}
      </View>
    </View>
  );
}
