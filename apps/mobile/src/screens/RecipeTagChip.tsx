import type { RecipeTag } from "@nookly/shared/data";
import {
  type Icon,
  IconBolt,
  IconBread,
  IconCake,
  IconChefHat,
  IconFish,
  IconFlame,
  IconLeaf,
  IconPepper,
  IconPig,
  IconSalad,
  IconSeeding,
  IconSoup,
  IconTag,
} from "@tabler/icons-react-native";
import { View } from "react-native";
import { Text } from "../ui/Text.tsx";
import { CORNER } from "../ui/tokens.ts";

/// The desktop's icon per recipe tag (`recipe-tags.tsx`). Its chicken and beef are Lucide's,
/// which the phone doesn't carry, so those two show the desktop's fallback, the tag.
const TAG_ICONS = new Map<string, Icon>([
  ["pig", IconPig],
  ["fish", IconFish],
  ["leaf", IconLeaf],
  ["seedling", IconSeeding],
  ["salad", IconSalad],
  ["soup", IconSoup],
  ["chef", IconChefHat],
  ["bread", IconBread],
  ["cake", IconCake],
  ["flame", IconFlame],
  ["pepper", IconPepper],
  ["bolt", IconBolt],
]);

/// A recipe tag as the desktop's quiet chip: tinted with the tag's colour, its icon in it.
export function RecipeTagChip({ tag }: { tag: RecipeTag }) {
  const Glyph = TAG_ICONS.get(tag.icon) ?? IconTag;
  return (
    <View
      accessible
      accessibilityLabel={`Tag ${tag.name}`}
      className="flex-row items-center gap-1 self-start rounded-md border px-1.5 py-0.5"
      style={{ ...CORNER, backgroundColor: `${tag.color}24`, borderColor: `${tag.color}66` }}
    >
      <Glyph size={12} color={tag.color} />
      <Text variant="small" numberOfLines={1} style={{ maxWidth: 128 }}>
        {tag.name}
      </Text>
    </View>
  );
}
