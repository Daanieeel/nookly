import { PROVIDER_MARKS } from "@nookly/frontend/lib/provider-marks";
import { IconBrandAppleFilled, IconLock } from "@tabler/icons-react-native";
import { SvgXml } from "react-native-svg";

const DRAWN = new Set<string>(["google", "github", "notion"]);
const isDrawn = (provider: string): provider is keyof typeof PROVIDER_MARKS => DRAWN.has(provider);

/// The desktop's own mark for a way of signing in (`google`, `apple`, `github`, `notion`, or
/// `credential` for an email and password): Google in its colours, GitHub's round mark and
/// Apple's in the text colour, Notion's white page with black lines.
export function ProviderMark({
  provider,
  size = 20,
  color,
}: {
  provider: string;
  size?: number;
  color: string;
}) {
  if (isDrawn(provider)) {
    return <SvgXml xml={PROVIDER_MARKS[provider]} width={size} height={size} color={color} />;
  }
  const Mark = provider === "apple" ? IconBrandAppleFilled : IconLock;
  return <Mark size={size} color={color} />;
}
