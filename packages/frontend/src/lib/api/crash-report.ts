import { invoke } from "@tauri-apps/api/core";

/// What Nookly knows about the last time it closed unexpectedly. Nothing in it is
/// sent anywhere: see `src-tauri/src/crash_report.rs`.
export interface CrashReport {
  /// When it happened. Pass it to `dismissCrashReport`.
  occurredAt: string;
  appVersion: string | null;
  os: string;
  message: string;
  /// The whole report as plain text, for copying.
  text: string;
}

/// The newest crash the person has not dismissed yet, or null.
export function latestCrashReport(): Promise<CrashReport | null> {
  return invoke("latest_crash_report");
}

/// Marks that crash, and every older one, as dealt with.
export function dismissCrashReport(occurredAt: string): Promise<void> {
  return invoke("dismiss_crash_report", { occurredAt });
}
