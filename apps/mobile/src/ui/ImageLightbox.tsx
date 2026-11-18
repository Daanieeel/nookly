import { IconX } from "@tabler/icons-react-native";
import { Image, ScrollView, View } from "react-native";
import { IconButton } from "./Button.tsx";
import { useWindowSize } from "./pane.tsx";
import { Sheet } from "./sheet/Sheet.tsx";
import { useTheme } from "./theme.ts";

/// How far a picture zooms in under two fingers.
const MAX_ZOOM = 5;

/// A picture as large as the window allows, as the desktop's `ImageLightbox`: two fingers
/// pinch it larger and move it around (the system's own zoom), Close or Escape put it away.
export function ImageLightbox({
  image,
  onClose,
}: {
  image: { uri: string; alt: string } | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowSize();
  const shown = Math.max(240, height - 220);
  return (
    <Sheet
      open={image !== null}
      onOpenChange={(open) => !open && onClose()}
      title={image?.alt || "Picture"}
      kind="focus"
    >
      <View className="gap-2 p-2">
        <View className="flex-row justify-end">
          <IconButton
            label="Close Picture"
            icon={<IconX size={20} color={theme.colors.mutedForeground} />}
            onPress={onClose}
          />
        </View>
        <ScrollView
          testID="image-lightbox"
          style={{ height: shown }}
          maximumZoomScale={MAX_ZOOM}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {image ? (
            <Image
              source={{ uri: image.uri }}
              accessibilityLabel={image.alt}
              resizeMode="contain"
              style={{ width: "100%", height: shown }}
            />
          ) : null}
        </ScrollView>
      </View>
    </Sheet>
  );
}
