import type { ReactNode } from "react";
import { View } from "react-native";
import { PageGutterProvider } from "../row-edge.tsx";
import { useSectionRadius } from "../sheet/in-sheet.ts";
import { CORNER, SPACE, elevation } from "../tokens.ts";
import { SectionHeader } from "./GroupedSection.tsx";
import { useScheme, useSurface } from "./scheme.ts";

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
  const scheme = useScheme();
  const radius = useSectionRadius();
  return (
    <View>
      {title ? <SectionHeader title={title} /> : null}
      <View
        testID="surface"
        style={[
          CORNER,
          elevation("card", scheme),
          { backgroundColor: surface, borderRadius: radius, padding },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/// A plain list's rows on a raised, rounded card (a Home's lists): the rows reach the card's
/// edges, so a pressed row and its swipe actions fill it and stay inside its corners, while
/// what they show sits in line with the cards around it.
export function RowsCard({ children }: { children: ReactNode }) {
  const surface = useSurface();
  const scheme = useScheme();
  const radius = useSectionRadius();
  return (
    <View
      testID="rows-card"
      style={[
        CORNER,
        elevation("card", scheme),
        {
          backgroundColor: surface,
          borderRadius: radius,
          paddingHorizontal: SPACE.sm,
          overflow: "hidden",
        },
      ]}
    >
      <PageGutterProvider value={SPACE.sm}>{children}</PageGutterProvider>
    </View>
  );
}
