import { useLocalSearchParams } from "expo-router";
import { MoodleSignInScreen } from "../screens/MoodleScreens.tsx";

/// Where Moodle's `nookly://token=...` link lands (`+native-intent.tsx`).
export default function MoodleSignIn() {
  const { link } = useLocalSearchParams<{ link: string }>();
  return <MoodleSignInScreen link={link ?? ""} />;
}
