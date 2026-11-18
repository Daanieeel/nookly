import { badgeVariants } from "@nookly/ui/classes";
import type { VariantProps } from "class-variance-authority";
import { View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { Text } from "./Text.tsx";

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/// The desktop's `Badge`, with its variants (`badgeVariants`).
export function Badge({
  label,
  variant = "secondary",
  size = "md",
}: {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md" | "lg";
}) {
  const { box, text } = splitText(row(badgeVariants({ variant, size })));
  return (
    <View className={cn(box, "self-start")}>
      <Text className={text}>{label}</Text>
    </View>
  );
}

/// A Space's color as a dot, as next to items in the desktop's lists.
export function SpaceDot({ color }: { color: string }) {
  return <View className="size-2 rounded-full" style={{ backgroundColor: color }} />;
}
