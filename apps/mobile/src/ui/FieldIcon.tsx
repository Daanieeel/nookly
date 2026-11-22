import type { ComponentType } from "react";

import { useTheme } from "./theme.ts";

/// The icon at the start of a `Field`, stood in for its name: tinted as secondary text.
export function FieldIcon({
  icon: Icon,
}: {
  icon: ComponentType<{ size: number; color: string }>;
}) {
  const theme = useTheme();
  return <Icon size={18} color={theme.colors.mutedForeground} />;
}
