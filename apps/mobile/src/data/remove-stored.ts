/// A file as removing it needs it.
export interface StoredCopy {
  uri: string;
  exists: boolean;
  sha256(): Promise<string>;
  delete(): void;
}

/// Deletes a file the account holds, when the phone signs out: only one of the app's own
/// copies in `folder` (a folder address ending in a slash) that still holds exactly
/// `sha256`. Whether it was deleted.
export async function removeStored(
  file: StoredCopy,
  folder: string,
  sha256: string,
): Promise<boolean> {
  if (!file.uri.startsWith(folder) || file.uri.includes("/../") || !file.exists) return false;
  if ((await file.sha256()) !== sha256) return false;
  file.delete();
  return true;
}
