import type { ModalProps } from "react-native";

/// Every way a device can be held. React Native's `Modal` allows only portrait on iOS
/// unless told otherwise, so an iPad held in landscape turned as a popover, menu or dialog
/// opened. The app's own setting (`orientation` in `app.json`) still has the last word.
export const ANY_ORIENTATION: ModalProps["supportedOrientations"] = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
];
