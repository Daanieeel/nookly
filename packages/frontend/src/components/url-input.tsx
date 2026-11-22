import { useState, type ComponentProps } from "react";
import { IconInput } from "@nookly/ui/components/icon-input";
import { splitUrl, typedUrl } from "@nookly/shared/url-field";
import { PasswordInput } from "#/components/password-input.tsx";

/// An address field. The scheme (`https://`) is fixed text beside the icon, so nobody types it,
/// and one typed or pasted is dropped. `value` and `onValueChange` hold the whole address.
/// `secret` hides the rest of it like a password, for a link that works as one.
export function UrlInput({
  value,
  onValueChange,
  secret = false,
  ...props
}: Omit<ComponentProps<typeof IconInput>, "value" | "onChange" | "type" | "addon"> & {
  value: string;
  onValueChange: (value: string) => void;
  secret?: boolean;
}) {
  const shown = splitUrl(value);
  const [scheme, setScheme] = useState(shown.scheme);
  // An address that arrives from outside (saved, or reset) brings its own scheme.
  if (shown.explicit && shown.scheme !== scheme) setScheme(shown.scheme);
  const shared = {
    ...props,
    addon: scheme,
    value: shown.rest,
    onChange: (event: { target: { value: string } }) => {
      const next = typedUrl(event.target.value, scheme);
      setScheme(next.scheme);
      onValueChange(next.value);
    },
  };
  return secret ? <PasswordInput {...shared} noun="Link" /> : <IconInput {...shared} />;
}
