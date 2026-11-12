// Gesture handler's own test setup, so swipe rows render in tests.
import "react-native-gesture-handler/jestSetup";
import { mascotMotion } from "./src/ui/mascot-motion.ts";

// The animated mascot runs its loops on Reanimated's frame callbacks, which the test stand
// in lacks; tests draw the still one, the same picture.
mascotMotion.available = false;
