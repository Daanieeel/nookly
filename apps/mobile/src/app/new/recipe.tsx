import { useLocalSearchParams } from "expo-router";
import { NewRecipeScreen } from "../../screens/RecipeScreens.tsx";

export default function Route() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewRecipeScreen spaceId={spaceId} />;
}
