import { IconX } from "@tabler/icons-react-native";
import { useEffect } from "react";
import { AccessibilityInfo, View } from "react-native";
import { Button, IconButton } from "./Button.tsx";
import { useKeyboardTop } from "./sheet/Floating.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { type Toast, dismissToast, useToasts } from "./toast.ts";

/// How long a toast stays, as the desktop's.
const SHOWN_FOR = 5000;
const EDGE = 16;

/// The window's toasts at its bottom right, above the keyboard, newest last (the desktop's
/// `AppToaster`).
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const keyboard = useKeyboardTop().height;
  useEffect(() => {
    useToasts.setState((s) => ({ hosts: s.hosts + 1 }));
    return () => useToasts.setState((s) => ({ hosts: s.hosts - 1 }));
  }, []);
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute gap-2"
      style={{ right: EDGE, bottom: EDGE + keyboard, width: 356, maxWidth: "90%" }}
    >
      {toasts.map((shown) => (
        <ToastCard key={shown.id} toast={shown} />
      ))}
    </View>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const theme = useTheme();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(toast.title);
    const timer = setTimeout(() => dismissToast(toast.id), SHOWN_FOR);
    return () => clearTimeout(timer);
  }, [toast.id, toast.title]);
  const action = toast.action;
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 rounded-xl border border-border bg-popover py-1.5 pl-4 pr-1.5 shadow-lg"
    >
      <Text className="flex-1">{toast.title}</Text>
      {action ? (
        <Button
          label={action.label}
          variant="secondary"
          size="sm"
          onPress={() => {
            dismissToast(toast.id);
            action.onPress();
          }}
        />
      ) : null}
      <IconButton
        label="Dismiss"
        size="iconSm"
        icon={<IconX size={14} color={theme.colors.mutedForeground} />}
        onPress={() => dismissToast(toast.id)}
      />
    </View>
  );
}
