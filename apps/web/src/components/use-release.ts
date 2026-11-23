"use client";

import { useEffect, useState } from "react";
import { FALLBACK_RELEASE, fetchLatestRelease, type Release } from "@/lib/releases";

let shared: Promise<Release> | null = null;

/// The latest desktop release. The static page has no version in it: this starts as the
/// releases page fallback and fills in once the browser has asked GitHub, once per page for
/// every button and list that uses it.
export function useRelease(): Release {
  const [release, setRelease] = useState(FALLBACK_RELEASE);
  useEffect(() => {
    let live = true;
    (shared ??= fetchLatestRelease()).then((latest) => {
      if (live) setRelease(latest);
    });
    return () => {
      live = false;
    };
  }, []);
  return release;
}
