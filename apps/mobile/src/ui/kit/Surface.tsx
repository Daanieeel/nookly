import type { ReactNode } from "react";
import { View } from "react-native";
import { useSectionRadius } from "../sheet/in-sheet.ts";
import { CORNER, SPACE } from "../tokens.ts";
import { SectionHeader } from "./GroupedSection.tsx";
import { useSurface } from "./scheme.ts";

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
  const surface = useSurface();
  const radius = useSectionRadius();
  return (
    <View>
      {title ? <SectionHeader title={title} /> : null}
      <View
        testID="surface"
        style={[CORNER, { backgroundColor: surface, borderRadius: radius, padding }]}
      >
        {children}
      </View>
    </View>
  );
}
