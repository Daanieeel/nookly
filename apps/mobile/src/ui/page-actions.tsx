import { Stack } from "expo-router";
import {
  type ComponentType,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { type ImageSourcePropType, View } from "react-native";
import { BAR_BUTTON } from "./bar.ts";
import { Button } from "./Button.tsx";
import { type SlotStore, useSlot, useSlotStore } from "./floating.tsx";
import { useIsTablet } from "./pane.tsx";
import { useTheme } from "./theme.ts";

/// One of a page's actions (New Task, Scan Document): the desktop's Tabler icon for the
/// tablet's labelled button, and the same icon drawn for the phone's bar
/// (`TOOLBAR_ICONS`).
export interface PageAction {
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  toolbarIcon: ImageSourcePropType;
  onPress: () => void;
  /// The page's main action, drawn filled on a tablet as the desktop's "New task".
  primary?: boolean;
}

/// Where a `Screen` keeps its page's actions, and whether its list header shows them.
interface PageActionSlots {
  actions: SlotStore;
  claims: SlotStore;
}

const PageActionsContext = createContext<PageActionSlots | null>(null);

/// The slots a `Screen` gives its page: `drawn` are its actions while no list header
/// shows them, for the Screen to draw at its top.
export function usePageActionSlots() {
  const actions = useSlotStore();
  const claims = useSlotStore();
  const slots = useMemo(
    () => ({ actions: actions.store, claims: claims.store }),
    [actions.store, claims.store],
  );
  return {
    slots,
    unclaimed: claims.shown.length === 0 ? actions.shown : [],
  };
}

export const PageActionsProvider = PageActionsContext.Provider;

/// A page's actions. On a phone they are round buttons in the system's bar; on a tablet,
/// the desktop made for touch, labelled buttons in the page's header row (`ListHeader`),
/// or at the top of a page without one.
export function PageActions({ actions }: { actions: PageAction[] }) {
  const tablet = useIsTablet();
  const slots = useContext(PageActionsContext);
  const inPage = tablet && slots !== null;
  const node = inPage ? <ActionButtons actions={actions} /> : null;
  useSlot(inPage ? slots.actions : null, node);
  if (inPage || actions.length === 0) return null;
  return (
    <Stack.Toolbar placement="right">
      {actions.map((a) => (
        <Stack.Toolbar.Button
          key={a.label}
          icon={a.toolbarIcon}
          {...BAR_BUTTON}
          accessibilityLabel={a.label}
          onPress={a.onPress}
        />
      ))}
    </Stack.Toolbar>
  );
}

/// The page's actions for a list header to show in its row, claimed so the `Screen` does
/// not draw them again.
export function useClaimedPageActions() {
  const slots = useContext(PageActionsContext);
  const id = useId();
  // Claimed once while shown, not on every render.
  useLayoutEffect(() => {
    if (!slots) return;
    slots.claims.put(id, "claimed");
    return () => slots.claims.put(id, null);
  }, [slots, id]);
  const empty = useSlotStore().store;
  const store = slots?.actions ?? empty;
  return useSyncExternalStore(store.subscribe, store.snapshot);
}

function ActionButtons({ actions }: { actions: PageAction[] }) {
  const theme = useTheme();
  return (
    <View className="flex-row items-center gap-2">
      {actions.map(({ label, icon: Icon, onPress, primary }) => (
        <Button
          key={label}
          label={label}
          variant={primary ? "default" : "secondary"}
          size="sm"
          icon={
            <Icon
              size={16}
              color={primary ? theme.colors.primaryForeground : theme.colors.foreground}
            />
          }
          onPress={onPress}
        />
      ))}
    </View>
  );
}
