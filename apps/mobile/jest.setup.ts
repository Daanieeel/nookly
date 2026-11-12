// Gesture handler's own test setup, so swipe rows render in tests.
import "react-native-gesture-handler/jestSetup";

// The animated mascot runs its loops on Reanimated's frame callbacks, which the test stand
// in lacks; tests draw the still one, the same picture.
jest.mock("@blobatar/react-native/animated", () => {
  const { Blobatar } = jest.requireActual("@blobatar/react-native");
  return {
    AnimatedBlobatar: ({
      animate: _animate,
      ...props
    }: {
      animate?: boolean;
      name: string;
      size: number;
    }) => Blobatar(props),
  };
});
