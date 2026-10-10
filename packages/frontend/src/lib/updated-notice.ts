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
/// last one the user has been told about (kept in preferences), else `null`. The first run
/// has nothing to compare with and a move to an older version (a restored install) is not
/// news, so both only note the version. `dismiss` marks the running version as told.
export function useUpdatedNotice(): UpdatedNotice {
  const running = useAppVersion();
  const [seen, setSeen] = useState(() => preferences.get(STORAGE_KEYS.lastSeenVersion));

  useEffect(() => {
    if (!running) return;
    if (seen === null || compareVersions(running, seen) < 0) {
      preferences.set(STORAGE_KEYS.lastSeenVersion, running);
      setSeen(running);
    }
  }, [running, seen]);

  const updated = running && seen !== null && compareVersions(running, seen) > 0;
  return {
    version: updated ? running : null,
    dismiss: () => {
      if (!running) return;
      preferences.set(STORAGE_KEYS.lastSeenVersion, running);
      setSeen(running);
    },
  };
}
