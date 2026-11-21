import type { ReactNode } from "react";

export type GalleryGroup = string;

export interface GalleryEntry {
  /** Anchor in the page and the key in the sidebar. */
  id: string;
  name: string;
  group: GalleryGroup;
  /** The file it lives in, from the repo root. */
  source: string;
  /** What it does, in a sentence. */
  note?: string;
  render: () => ReactNode;
}
