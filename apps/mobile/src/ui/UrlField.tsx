import { type ComponentProps, type ComponentType, useState } from "react";
import { View } from "react-native";
import { splitUrl, typedUrl } from "@nookly/shared/url-field";
import { Field } from "./Field.tsx";
import { FieldIcon } from "./FieldIcon.tsx";
import { Label } from "./kit/Label.tsx";
import { SPACE } from "./tokens.ts";

/// An address field. The scheme (`https://`) stands beside the icon as fixed text, so nobody
/// types it, and one typed or pasted is dropped. `value` and `onValueChange` hold the whole
/// address. It is a `Field` otherwise, and its name is read out but not drawn.
export function UrlField({
  icon,
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Field>, "icon" | "value" | "onChangeText" | "keyboardType"> & {
  icon: ComponentType<{ size: number; color: string }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const shown = splitUrl(value);
  const [scheme, setScheme] = useState(shown.scheme);
  // An address that arrives from outside (saved, or reset) brings its own scheme.
  if (shown.explicit && shown.scheme !== scheme) setScheme(shown.scheme);
  return (
    <Field
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      keyboardType="url"
      icon={
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.xs }}>
          <FieldIcon icon={icon} />
          <Label color="secondaryLabel">{scheme}</Label>
        </View>
      }
      value={shown.rest}
      onChangeText={(typed) => {
        const next = typedUrl(typed, scheme);
        setScheme(next.scheme);
        onValueChange(next.value);
      }}
    />
  );
}
