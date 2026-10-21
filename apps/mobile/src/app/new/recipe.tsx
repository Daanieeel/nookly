import { sheetRoute } from "../../ui/sheet/route.tsx";
import { useLocalSearchParams } from "expo-router";
import { NewRecipeScreen } from "../../screens/RecipeScreens.tsx";

function Route() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  return <NewRecipeScreen spaceId={spaceId} />;
}

export default sheetRoute("New Recipe", Route);
