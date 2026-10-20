import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { insetPageStyle, pageShadow } from "../ui/inset-page.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { DetailsBody } from "./inspector.tsx";

/// Lets the page open the details behind it (from the "more" menu).
const DetailsHandle = createContext<{ show(): void } | null>(null);
export const useDetails = () => useContext(DetailsHandle);

/// The sidebar turned around: an open item sits above its details, as the page sits above
/// the left sidebar, and a swipe the other way slides the page aside to show them.
export function DetailsDrawer({ id, children }: { id: string; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const handle = useMemo(() => ({ show: () => setOpen(true) }), []);
  const drawerWidth = Math.min(width * 0.86, 360);
  // Closed, only a drag to the left is this drawer's; a drag to the right belongs to the
  // sidebar behind the whole app.
  const configure = useCallback(
    (
      gesture: Parameters<
        NonNullable<React.ComponentProps<typeof Drawer>["configureGestureHandler"]>
      >[0],
    ) => (open ? gesture : gesture.activeOffsetX([-10_000, -5])),
    [open],
  );
  return (
    <Drawer
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      drawerPosition="right"
      drawerType="back"
      swipeEdgeWidth={width}
      configureGestureHandler={configure}
      overlayStyle={{ backgroundColor: "transparent" }}
      drawerStyle={{ width: drawerWidth, backgroundColor: theme.colors.background }}
      renderDrawerContent={() => (
        <View
          accessibilityLabel="Details"
          className="flex-1"
          style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 p-4">
            <Text variant="small" tone="muted" accessibilityRole="header">
              Details
            </Text>
            <DetailsBody id={id} />
          </ScrollView>
        </View>
      )}
    >
      <DetailsHandle.Provider value={handle}>
        <View
          className="flex-1"
          style={[insetPageStyle(theme.colors.page), { boxShadow: pageShadowRight(theme.dark) }]}
        >
          {children}
        </View>
      </DetailsHandle.Provider>
    </Drawer>
  );
}

/// The shadow the page casts to its right, onto the details.
function pageShadowRight(dark: boolean): string {
  return pageShadow(dark).replace("-8px", "8px");
}
