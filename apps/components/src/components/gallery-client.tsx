"use client";

import dynamic from "next/dynamic";

// Some components (the mascot) read browser state while rendering and have no server version,
// so the gallery is drawn in the browser only.
const GalleryShell = dynamic(() => import("./gallery-shell").then((m) => m.GalleryShell), {
  ssr: false,
});

export function GalleryClient() {
  return <GalleryShell />;
}
