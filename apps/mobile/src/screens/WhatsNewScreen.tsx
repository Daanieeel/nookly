import { parseWhatsNew } from "@nookly/shared/whats-new";
import { View } from "react-native";
import { Badge } from "../ui/Badge.tsx";
import { Empty, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";

/// The notes are written with a little markdown; on the phone they read as plain text.
export const plain = (text: string) => text.replace(/[`*_]/g, "");

const versionOrder = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
};

/// What changed in Nookly, newest first, as written for the people who use it. The notes
/// are for the whole product, so what you read here may be on the computer first.
export function WhatsNewScreen() {
  const releases = parseWhatsNew().toSorted((a, b) => versionOrder(a.version, b.version));
  if (releases.length === 0) {
    return (
      <Screen>
        <Empty text="Nothing written up yet." />
      </Screen>
    );
  }
  return (
    <Screen>
      {releases.map((release) => (
        <View key={release.version} className="gap-2">
          <View className="gap-0.5 px-1">
            <Text accessibilityRole="header" variant="title" className="text-xl">
              {release.title ?? `Nookly ${release.version}`}
            </Text>
            <Text variant="small" tone="muted">
              {release.version}, {release.date}
            </Text>
            {release.summary ? <Text tone="muted">{plain(release.summary)}</Text> : null}
          </View>
          {release.highlights.length > 0 ? (
            <Section>
              {release.highlights.map((h) => (
                <View key={h.title} className="gap-1 p-4">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-medium">{h.title}</Text>
                    {h.tag ? (
                      <Badge
                        label={h.tag}
                        variant={h.tag === "New" ? "primary" : "secondary"}
                        size="sm"
                      />
                    ) : null}
                  </View>
                  <Text tone="muted">{plain(h.description)}</Text>
                </View>
              ))}
            </Section>
          ) : null}
          {Object.entries(release.more).map(([heading, lines]) => (
            <View key={heading} className="gap-1 px-1">
              <Text variant="small" tone="muted">
                {heading}
              </Text>
              {lines.map((line) => (
                <Text key={line}>{plain(line)}</Text>
              ))}
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}
