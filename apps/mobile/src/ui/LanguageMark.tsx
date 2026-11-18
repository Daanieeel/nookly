import { CODE_LANGUAGE_MARKS } from "@nookly/frontend/lib/code-language-marks";
import { IconFileCode } from "@tabler/icons-react-native";
import { SvgXml } from "react-native-svg";
import { useSemanticPair } from "./kit/scheme.ts";
import type { Option } from "./sheet/OptionList.tsx";

const BY_VALUE = new Map(CODE_LANGUAGE_MARKS.map((mark) => [mark.value, mark.svg]));

/// A code language's coloured mark, the desktop's own; plain text gets the file icon.
export function LanguageMark({ language, size = 18 }: { language: string; size?: number }) {
  const muted = useSemanticPair("secondaryLabel");
  const svg = BY_VALUE.get(language);
  if (!svg) return <IconFileCode size={size} color={muted.hex} />;
  return <SvgXml xml={svg} width={size} height={size} />;
}

const PLAIN_TEXT = "plaintext";

/// Every language a code block can be, as the desktop's picker lists them: plain text first.
export const CODE_LANGUAGE_OPTIONS: Option[] = [
  { id: PLAIN_TEXT, label: "Plain Text", icon: <LanguageMark language={PLAIN_TEXT} /> },
  ...CODE_LANGUAGE_MARKS.map((lang) => ({
    id: lang.value,
    label: lang.label,
    icon: <LanguageMark language={lang.value} />,
  })),
];
