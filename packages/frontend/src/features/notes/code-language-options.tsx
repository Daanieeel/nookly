import { IconFileCode } from "@tabler/icons-react";
import type { SelectFieldOption } from "#/components/select-field.tsx";
import { CODE_LANGUAGES } from "./code-languages";
import { PLAIN_TEXT } from "./default-code-language";

/// Plain text plus every language the code block picker offers, for a `SelectField`.
/// `leading` options come first, like a note's "Use default".
export function codeLanguageOptions(leading: SelectFieldOption[] = []): SelectFieldOption[] {
  return [
    ...leading,
    {
      value: PLAIN_TEXT,
      label: "Plain Text",
      icon: <IconFileCode className="size-3.5 text-muted-foreground" />,
    },
    ...CODE_LANGUAGES.map((l) => ({
      value: l.value,
      label: l.label,
      icon: <l.icon className="size-3.5" />,
    })),
  ];
}
