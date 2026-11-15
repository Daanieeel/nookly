import {
  IconApple,
  IconCake,
  IconDots,
  IconEggFried,
  IconSalad,
  IconToolsKitchen2,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { RecipeKind } from "#/lib/api/types.ts";

/// Mirrors `RECIPE_KINDS` in `src-tauri/src/db/recipes.rs` — keep the two in sync.
export const RECIPE_KINDS: RecipeKind[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "other",
];

export const RECIPE_KIND_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
  other: "Other",
} satisfies Record<RecipeKind, string>;

export const RECIPE_KIND_ICONS = {
  breakfast: IconEggFried,
  lunch: IconSalad,
  dinner: IconToolsKitchen2,
  snack: IconApple,
  dessert: IconCake,
  other: IconDots,
} satisfies Record<RecipeKind, TablerIcon>;

/// How long a recipe takes, in the steps a meal is planned by.
export const RECIPE_TIME_BUCKETS: { id: string; label: string }[] = [
  { id: "15", label: "15 minutes or less" },
  { id: "30", label: "30 minutes or less" },
  { id: "60", label: "An hour or less" },
  { id: "longer", label: "Longer" },
  { id: "none", label: "Not set" },
];

export function recipeTime(minutes: number | null): string {
  if (minutes === null) return "none";
  if (minutes <= 15) return "15";
  if (minutes <= 30) return "30";
  return minutes <= 60 ? "60" : "longer";
}
