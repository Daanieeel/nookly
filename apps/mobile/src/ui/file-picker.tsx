import { File } from "expo-file-system";
import { createContext, useContext } from "react";

/// How the person picks a text file (a Nookly file): the phone's own picker, or a test's.
/// Resolves to its text, or null when they back out.
export interface TextFilePicker {
  pickText(mimeTypes: string[]): Promise<string | null>;
}

export const systemFilePicker: TextFilePicker = {
  pickText: async (mimeTypes) => {
    const picked = await File.pickFileAsync({ mimeTypes });
    return picked.canceled ? null : picked.result.text();
  },
};

const FilePickerContext = createContext<TextFilePicker>(systemFilePicker);
export const FilePickerProvider = FilePickerContext.Provider;
export const useFilePicker = () => useContext(FilePickerContext);
