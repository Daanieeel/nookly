import { Paths } from "expo-file-system";
/// Where an app's Documents folder sits in a stored file address: iOS's
/// `.../Containers/Data/Application/<ID>/Documents/`, the ID named anew when the app is
/// restored onto another phone.
const APP_DOCUMENTS = /^file:\/\/.*\/Containers\/Data\/Application\/[^/]+\/Documents\//;

/// A stored file address, read from this app's own Documents folder (`documents`, with its
/// trailing slash) when it was written under an earlier one. Anything else is kept as is.
/// Only reading changes: what is stored stays as it was.
export function rerooted(uri: string, documents: string | null): string {
  if (!documents) return uri;
  const match = APP_DOCUMENTS.exec(uri);
  if (!match || match[0] === documents) return uri;
  return documents + uri.slice(match[0].length);
}

/// This app's Documents folder as a file address, or nothing where there is none (tests).
function documentsUri(): string | null {
  try {
    const uri = Paths.document.uri;
    return uri.endsWith("/") ? uri : `${uri}/`;
  } catch {
    return null;
  }
}

/// A stored file address as it can be read on this phone now (see `rerooted`).
export function livePath(uri: string): string;
export function livePath(uri: string | null): string | null;
export function livePath(uri: string | null): string | null {
  return uri === null ? null : rerooted(uri, documentsUri());
}
