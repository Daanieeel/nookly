import { ScrollView, View } from "react-native";
import { isSharedSpace } from "@nookly/shared/api";
import { useEntity } from "../data/queries.ts";
import { LabelsSection, RelatedSection } from "../screens/RelatedSection.tsx";
import { useReadOnly } from "../screens/useReadOnly.ts";
import { INSPECTOR_WIDTH } from "../ui/pane.tsx";
import { Text } from "../ui/Text.tsx";

/// The desktop's right sidebar: the labels of the open item and everything it is tied to,
/// beside the page instead of at the bottom of it.
export function Inspector({ id }: { id: string }) {
  const { data: entity } = useEntity(id);
  const readOnly = useReadOnly(entity);
  if (!entity || entity.deletedAt || isSharedSpace(entity.spaceId)) return null;
  return (
    <View
      accessibilityLabel="Details"
      className="border-l border-border bg-background"
      style={{ width: INSPECTOR_WIDTH }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 p-4">
        <Text variant="small" tone="muted" accessibilityRole="header">
          Details
        </Text>
        <LabelsSection entity={entity} readOnly={readOnly} />
        <RelatedSection entity={entity} readOnly={readOnly} />
      </ScrollView>
    </View>
  );
}
