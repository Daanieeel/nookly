import { ScrollView, View } from "react-native";
import { isSharedSpace } from "@nookly/shared/api";
import { useEntity } from "../data/queries.ts";
import { ItemParts } from "../screens/ItemParts.tsx";
import { LabelsSection, RelatedSection } from "../screens/RelatedSection.tsx";
import { useReadOnly } from "../screens/useReadOnly.ts";
import { INSPECTOR_WIDTH } from "../ui/pane.tsx";
import { PartProvider } from "../ui/parts.tsx";
import { Text } from "../ui/Text.tsx";

/// What the details hold, in the desktop's order: the item's own properties, its labels and
/// everything it is tied to.
export function DetailsBody({ id }: { id: string }) {
  const { data: entity } = useEntity(id);
  const readOnly = useReadOnly(entity);
  if (!entity) return null;
  const mine = !entity.deletedAt && !isSharedSpace(entity.spaceId);
  return (
    <>
      <PartProvider value="details">
        <ItemParts entity={entity} readOnly={readOnly || Boolean(entity.deletedAt)} />
      </PartProvider>
      {mine ? <LabelsSection entity={entity} readOnly={readOnly} /> : null}
      {mine ? <RelatedSection entity={entity} readOnly={readOnly} /> : null}
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
