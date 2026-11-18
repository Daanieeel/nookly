import type { TermTypeDef } from "@nookly/shared/academic";
import { IconFlower, IconLeaf, IconSnowflake, IconSun } from "@tabler/icons-react-native";
import type { Option } from "../ui/sheet/OptionList.tsx";
import type { GlyphIcon } from "../ui/kit/Glyph.tsx";
import type { TintName } from "../ui/tokens.ts";

/// Each season's icon, the desktop's `TermIcon`, in a tint of its own.
const SEASONS = {
  winter: { glyph: IconSnowflake, tint: "blue" },
  summer: { glyph: IconSun, tint: "yellow" },
  fall: { glyph: IconLeaf, tint: "red" },
  spring: { glyph: IconFlower, tint: "green" },
} satisfies { [key: string]: { glyph: GlyphIcon; tint: TintName } };

function isSeason(key: string): key is keyof typeof SEASONS {
  return key in SEASONS;
}

/// A term system's terms as choices, each with its season's icon.
export function termOptions(terms: readonly TermTypeDef[]): Option[] {
  return terms.map((t) => {
    const option: Option = { id: t.key, label: t.label };
    if (isSeason(t.key)) Object.assign(option, SEASONS[t.key]);
    return option;
  });
}
