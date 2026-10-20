import * as Clipboard from "expo-clipboard";
import { createContext, useContext } from "react";

/// Where copied text goes. The phone's clipboard; a test supplies its own.
export interface ClipboardWriter {
  copy(text: string): Promise<void>;
}

export const systemClipboard: ClipboardWriter = {
  copy: async (text) => {
    await Clipboard.setStringAsync(text);
  },
};

const ClipboardContext = createContext<ClipboardWriter>(systemClipboard);
export const ClipboardProvider = ClipboardContext.Provider;
export const useClipboard = () => useContext(ClipboardContext);
