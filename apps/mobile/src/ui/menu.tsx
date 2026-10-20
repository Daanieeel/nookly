import { ActionSheetIOS, Alert, Platform } from "react-native";
import { createContext, useContext } from "react";

export interface MenuItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

/// How a list of actions is shown. The phone's own: an action sheet on iOS, an alert on
/// Android. A test supplies its own to choose an action without a screen.
export interface MenuPresenter {
  show(title: string | undefined, items: MenuItem[]): void;
}

export const nativeMenu: MenuPresenter = {
  show(title, items) {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...items.map((item) => item.label), "Cancel"],
          cancelButtonIndex: items.length,
          destructiveButtonIndex: items.findIndex((item) => item.destructive),
        },
        (index) => items[index]?.onPress(),
      );
      return;
    }
    Alert.alert(title ?? "", undefined, [
      ...items.map((item) => ({
        text: item.label,
        style: item.destructive ? ("destructive" as const) : ("default" as const),
        onPress: item.onPress,
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  },
};

const MenuContext = createContext<MenuPresenter>(nativeMenu);
export const MenuProvider = MenuContext.Provider;
export const useMenu = () => useContext(MenuContext);
