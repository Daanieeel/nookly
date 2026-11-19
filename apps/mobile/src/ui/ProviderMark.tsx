import { PROVIDER_MARKS } from "@nookly/frontend/lib/provider-marks";
import { IconBrandAppleFilled } from "@tabler/icons-react-native";
import { SvgXml } from "react-native-svg";

export type Provider = "Google" | "Apple" | "GitHub" | "Notion";

/// The desktop's own mark for a service an account can be made with: Google in its colours,
/// GitHub's round mark and Apple's in the text colour, Notion's white page with black lines.
export function ProviderMark({
  provider,
  size = 20,
  color,
}: {
  provider: Provider;
  size?: number;
  color: string;
}) {
  if (provider === "Apple") return <IconBrandAppleFilled size={size} color={color} />;
  const xml =
    PROVIDER_MARKS[provider === "Google" ? "google" : provider === "GitHub" ? "github" : "notion"];
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}
