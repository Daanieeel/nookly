import { useEffect, useState } from "react";
import { compareVersions } from "#/lib/changelog.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useAppVersion } from "#/lib/updater.ts";

export interface UpdatedNotice {
  /// The version that is running, when it is newer than the last one the user was told about.
  version: string | null;
  dismiss: () => void;
}

/// Whether Nookly was just updated: the version that is running when it is newer than the
/// last one the user has been told about (kept in preferences), else `null`. With no version
/// ever told (an install from before this was kept) the running version counts as news. A
/// move to an older version (a restored install) is not, so it only notes the version.
/// `dismiss` marks the running version as told.
export function useUpdatedNotice(): UpdatedNotice {
  const running = useAppVersion();
  const [seen, setSeen] = useState(() => preferences.get(STORAGE_KEYS.lastSeenVersion));

  useEffect(() => {
    if (!running) return;
    if (seen !== null && compareVersions(running, seen) < 0) {
      preferences.set(STORAGE_KEYS.lastSeenVersion, running);
      setSeen(running);
    }
  }, [running, seen]);

  const updated = running && (seen === null || compareVersions(running, seen) > 0);

  // Where "what is new" starts from: the version the user was on, kept until they update
  // again so the dialog can be opened from Settings after the card is gone.
  useEffect(() => {
    if (updated && seen !== null) preferences.set(STORAGE_KEYS.whatsNewSince, seen);
  }, [updated, seen]);
  return {
    version: updated ? running : null,
    dismiss: () => {
      if (!running) return;
      preferences.set(STORAGE_KEYS.lastSeenVersion, running);
      setSeen(running);
    },
  };
}
