import { useIsFocused } from "expo-router";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenStack, ScreenStackItem } from "react-native-screens";
import { PageEdge, insetPageStyle } from "../ui/inset-page.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { DetailsBody } from "./inspector.tsx";
import { NEVER, TAP_SLOP, useReportDetailsOpen, useSwipeOpens } from "./panes.tsx";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { DetailsHandleProvider } from "./details-context.ts";

/// The item whose details wait behind the page, and what its "more" button opens.
export interface DetailsItem {
  id: string;
  more?: () => void;
}

export { useDetails } from "./details-context.ts";

const DetailsRegister = createContext<Dispatch<SetStateAction<DetailsItem | null>> | null>(null);

/// Called by an open item: while its page is the one shown, the details behind the app
/// are its own.
export function useDetailsFor(item: DetailsItem | null) {
  const register = useContext(DetailsRegister);
  const focused = useIsFocused();
  const id = focused ? item?.id : undefined;
  const more = item?.more;
  useEffect(() => {
    if (!register || !id) return;
    const mine = { id, more };
    register(mine);
    // A page going away must not take the details of the one shown after it.
    return () => register((current) => (current === mine ? null : current));
  }, [register, id, more]);
}

/// The sidebar turned around: an open item sits above its details, as the page sits above
/// the left sidebar, and a swipe the other way slides the page aside to show them. The
/// drawer holds the whole stack, so the page goes with its own bar, rounded like the
/// sidebar's page; the bar's info and more buttons wait in the same place over the details.
export function DetailsDrawer({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [item, setItem] = useState<DetailsItem | null>(null);
  // Open for one item: another item, or none, shows its page, not the last one's details.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const id = item?.id ?? null;
  const open = id !== null && openFor === id;
  const setOpen = useCallback((next: boolean) => setOpenFor(next ? id : null), [id]);
  // While the sidebar is open a swipe closes it; it never opens these on the way.
  const swipeOpens = useSwipeOpens();
  useReportDetailsOpen(open);
  const handle = useMemo(
    () => ({ open, show: () => setOpen(true), hide: () => setOpen(false) }),
    [open, setOpen],
  );
  const drawerWidth = Math.min(width * 0.86, 360);
  // Closed, only a drag to the left is this drawer's; a drag to the right belongs to the
  // sidebar behind the whole app.
  const configure = useCallback(
    (
      gesture: Parameters<
        NonNullable<React.ComponentProps<typeof Drawer>["configureGestureHandler"]>
      >[0],
    ) =>
      (open
        ? gesture
        : gesture.activeOffsetX([-TAP_SLOP, NEVER]).failOffsetX([-NEVER, TAP_SLOP])
      ).withTestId("details-swipe"),
    [open],
  );
  return (
    <Drawer
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      drawerPosition="right"
      swipeEnabled={item !== null && swipeOpens.details}
      drawerType="back"
      swipeEdgeWidth={width}
      configureGestureHandler={configure}
      overlayStyle={{ backgroundColor: "transparent" }}
      drawerStyle={{ width: drawerWidth, backgroundColor: theme.colors.background }}
      // Behind the page's rounded corners, wherever it has slid to.
      style={{ backgroundColor: theme.colors.background }}
      renderDrawerContent={() => (
        <View
          accessibilityLabel="Details"
          className="flex-1"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          {/* A bar of the system's own, so the info and more buttons look and sit as
              they did in the page's bar while the page slides away under them. */}
          <ScreenStack style={{ flex: 1 }}>
            <ScreenStackItem
              screenId="details"
              headerConfig={{
                title: "",
                hideBackButton: true,
                hideShadow: true,
                backgroundColor: theme.colors.background,
                headerRightBarButtonItems: [
                  {
                    type: "button",
                    icon: { type: "templateSource", templateSource: TOOLBAR_ICONS.hideDetails },
                    accessibilityLabel: "Hide Details",
                    onPress: handle.hide,
                  },
                  ...(item?.more
                    ? [
                        {
                          type: "button" as const,
                          icon: {
                            type: "templateSource" as const,
                            templateSource: TOOLBAR_ICONS.more,
                          },
                          accessibilityLabel: "More",
                          onPress: item.more,
                        },
                      ]
                    : []),
                ],
              }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentInsetAdjustmentBehavior="automatic"
                contentContainerClassName="gap-5 p-4"
              >
                <Text variant="small" tone="muted" accessibilityRole="header">
                  Details
                </Text>
                {item ? <DetailsBody id={item.id} /> : null}
              </ScrollView>
            </ScreenStackItem>
          </ScreenStack>
          <PageEdge drawerWidth={drawerWidth} dark={theme.dark} side="right" />
        </View>
      )}
    >
      <DetailsRegister.Provider value={setItem}>
        <DetailsHandleProvider value={item ? handle : null}>
          <View testID="details-page" className="flex-1" style={insetPageStyle(theme.colors.page)}>
            {children}
          </View>
        </DetailsHandleProvider>
      </DetailsRegister.Provider>
    </Drawer>
  );
}
