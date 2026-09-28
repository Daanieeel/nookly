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
