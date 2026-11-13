import { CODE_LANGUAGE_MARKS } from "@nookly/frontend/lib/code-language-marks";
import { IconFileCode } from "@tabler/icons-react-native";
import { SvgXml } from "react-native-svg";
import { useSemanticPair } from "./kit/scheme.ts";

const BY_VALUE = new Map(CODE_LANGUAGE_MARKS.map((mark) => [mark.value, mark.svg]));

/// A code language's coloured mark, the desktop's own; plain text gets the file icon.
export function LanguageMark({ language, size = 18 }: { language: string; size?: number }) {
  const muted = useSemanticPair("secondaryLabel");
  const svg = BY_VALUE.get(language);
  if (!svg) return <IconFileCode size={size} color={muted.hex} />;
  return <SvgXml xml={svg} width={size} height={size} />;
}
