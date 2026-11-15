// Gesture handler's own test setup, so swipe rows render in tests.
import "react-native-gesture-handler/jestSetup";
import { Dimensions } from "react-native";
import { mascotMotion } from "./src/ui/mascot-motion.ts";

// The animated mascot runs its loops on Reanimated's frame callbacks, which the test stand
// in lacks; tests draw the still one, the same picture.
mascotMotion.available = false;

// The test renderer's window is an iPhone's in points (React Native's default is 750 wide,
// a tablet by D83's classes); a test of a tablet says so (`renderScreens(..., { width })`).
const iPhone = { width: 402, height: 874, scale: 3, fontScale: 1 };
Dimensions.set({ window: iPhone, screen: iPhone });
