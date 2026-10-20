import { ScrollView, View } from "react-native";
import { isSharedSpace } from "@nookly/shared/api";
import { useEntity } from "../data/queries.ts";
import { LabelsSection, RelatedSection } from "../screens/RelatedSection.tsx";
import { useReadOnly } from "../screens/useReadOnly.ts";
import { INSPECTOR_WIDTH } from "../ui/pane.tsx";
import { Text } from "../ui/Text.tsx";

/// What the details hold: the labels of an item and everything it is tied to.
export function DetailsBody({ id, labels = true }: { id: string; labels?: boolean }) {
  const { data: entity } = useEntity(id);
  const readOnly = useReadOnly(entity);
  if (!entity || entity.deletedAt || isSharedSpace(entity.spaceId)) return null;
  return (
    <>
      {labels ? <LabelsSection entity={entity} readOnly={readOnly} /> : null}
      <RelatedSection entity={entity} readOnly={readOnly} />
    </>
  );
}

/// The desktop's right sidebar: the details of the open item beside the page instead of
/// at the bottom of it.
export function Inspector({ id }: { id: string }) {
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
        <DetailsBody id={id} />
      </ScrollView>
    </View>
  );
}
