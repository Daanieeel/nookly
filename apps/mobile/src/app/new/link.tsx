import { useLocalSearchParams } from "expo-router";
import { LinkPickerScreen } from "../../screens/RelatedSection.tsx";

export default function NewLink() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  return <LinkPickerScreen entityId={entityId} />;
}
