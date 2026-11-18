import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { createContext, useContext } from "react";
import { storePicked } from "../data/files.ts";

/// Where a picture comes from: the photo library, the camera, or a file.
export type PhotoSource = "library" | "camera" | "file";

/// How the person picks a picture: the phone's own library, camera and file picker, or a
/// test's. Resolves to the picture stored in this phone's own folder (a `file://` URI), or
/// null when they back out.
export interface PhotoPicker {
  pick(source: PhotoSource): Promise<string | null>;
}

export const systemPhotoPicker: PhotoPicker = {
  pick: async (source) => {
    if (source === "file") {
      const picked = await File.pickFileAsync({ mimeTypes: "image/*" });
      return picked.canceled ? null : (await storePicked(picked.result)).uri;
    }
    if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      throw new Error("Nookly can't use the camera. Allow it in Settings.");
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9 };
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    return asset ? (await storePicked(new File(asset.uri))).uri : null;
  },
};

const PhotoPickerContext = createContext<PhotoPicker>(systemPhotoPicker);
export const PhotoPickerProvider = PhotoPickerContext.Provider;
export const usePhotoPicker = () => useContext(PhotoPickerContext);
