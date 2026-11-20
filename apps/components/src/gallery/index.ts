import { APP_COMPONENTS } from "./app-components";
import { PRIMITIVES } from "./primitives";
import type { GalleryEntry } from "./types";

export const GALLERY: GalleryEntry[] = [...PRIMITIVES, ...APP_COMPONENTS];
