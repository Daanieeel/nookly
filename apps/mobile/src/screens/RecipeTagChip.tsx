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
import { useScheme } from "../ui/kit/scheme.ts";
import { CORNER, RADIUS, TINT_FILL, withAlpha } from "../ui/tokens.ts";

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

/// A recipe tag as a soft chip: a wash of the tag's colour with a faint ring of it and a lit
/// top edge, its icon in the colour and its name in the text's own.
export function RecipeTagChip({ tag }: { tag: RecipeTag }) {
  const Glyph = TAG_ICONS.get(tag.icon) ?? IconTag;
  const scheme = useScheme();
  return (
    <View
      accessible
      accessibilityLabel={`Tag ${tag.name}`}
      className="flex-row items-center gap-1 self-start px-2 py-1"
      style={[
        CORNER,
        {
          borderRadius: RADIUS.badge,
          backgroundColor: withAlpha(tag.color, TINT_FILL[scheme]),
          boxShadow: [
            { offsetX: 0, offsetY: 0, spreadDistance: 1, color: withAlpha(tag.color, 0.22) },
            { offsetX: 0, offsetY: 1, color: "rgba(255,255,255,0.18)", inset: true },
          ],
        },
      ]}
    >
      <Glyph size={13} color={tag.color} />
      <Text variant="small" numberOfLines={1} style={{ maxWidth: 128 }}>
        {tag.name}
      </Text>
    </View>
  );
}
