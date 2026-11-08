import { formatDate } from "#/lib/datetime.ts";
import type { ReferenceProvider, ReferenceStateKey, ReferenceStatus } from "#/lib/api/types.ts";

/// The one wording for each of the five states, shared by every badge and tooltip, so a
/// file, a link and a Moodle course all say the same thing the same way.
const LABELS = {
  available: "Available",
  offline: "Offline",
  missing: "Missing",
  needsSignIn: "Needs sign in",
  notOnThisDevice: "Not on this device",
} satisfies Record<ReferenceStateKey, string>;

function targetNoun(provider: ReferenceProvider): string {
  if (provider === "file") return "file";
  if (provider === "link") return "link";
  return "Moodle page";
}

/// The badge text. Offline says when the last answer was, if there was one.
export function referenceStateLabel(status: ReferenceStatus): string {
  if (status.state === "offline" && status.asOf) {
    return `Offline, as of ${formatDate(status.asOf)}`;
  }
  return LABELS[status.state];
}

/// The sentence behind the badge.
export function referenceStateTooltip(
  status: ReferenceStatus,
  provider: ReferenceProvider,
): string {
  const noun = targetNoun(provider);
  switch (status.state) {
    case "available":
      if (provider === "file") return "The file is found on this device.";
      if (provider === "link") return "The link answers.";
      return "Moodle answers.";
    case "offline":
      return status.asOf
        ? `Can't be reached right now. This is what it said last, on ${formatDate(status.asOf)}.`
        : "Can't be reached right now.";
    case "missing":
      if (provider === "file") {
        return "Nothing is at this path any more. The file may have moved or been deleted.";
      }
      if (provider === "link") return "The link is dead.";
      return "Moodle no longer shows this.";
    case "needsSignIn":
      return `Your sign in has expired or is missing. Sign in again to see this ${noun}.`;
    case "notOnThisDevice":
      return "This file was added on another device. Locate it here, or copy it into Nookly.";
  }
}

/// How a badge is tinted: quiet while all is well, louder the more it needs the person.
export function referenceStateTone(
  state: ReferenceStateKey,
): "positive" | "neutral" | "warning" | "destructive" {
  switch (state) {
    case "available":
      return "positive";
    case "offline":
    case "notOnThisDevice":
      return "neutral";
    case "needsSignIn":
      return "warning";
    case "missing":
      return "destructive";
  }
}

/// What the provider is called to the person.
export function providerLabel(provider: ReferenceProvider): string {
  switch (provider) {
    case "file":
      return "File on disk";
    case "link":
      return "Link";
    case "moodle_course":
      return "Moodle course";
    case "moodle_assignment":
      return "Moodle assignment";
  }
}

/// Whether the person can fix this state by pointing Nookly at the file again.
export function canLocate(status: ReferenceStatus | null | undefined): boolean {
  return status?.state === "missing" || status?.state === "notOnThisDevice";
}
