function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/// Tiny deterministic PRNG (mulberry32) seeded from a hash — lets one hash
/// drive several independent-looking random values (hue, angle, position...)
/// without pulling in a dependency just for this.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// oklch hue band (roughly 40°-100°) that reads as yellow/olive/khaki even
/// at pastel lightness — steered around rather than left to chance, same
/// reasoning as the darker palette this replaced.
const AVOID_HUE_START = 35;
const AVOID_HUE_WIDTH = 65;

/// Maps a uniform `[0, 1)` onto the hue circle with `AVOID_HUE_START`..
/// `+AVOID_HUE_WIDTH` skipped over entirely.
function pickHue(rand: () => number): number {
  const usable = 360 - AVOID_HUE_WIDTH;
  const hue = rand() * usable;
  return hue < AVOID_HUE_START ? hue : hue + AVOID_HUE_WIDTH;
}

const BLOB_COUNT = 4;
// Hard floor/ceiling on every blob's L/C, not just a loose "aim for pastel"
// range — nothing this function generates can land below `MIN_LIGHTNESS` or
// above `MAX_CHROMA`, which is what actually rules out dark and
// moody/muddy results rather than just making them less likely.
const MIN_LIGHTNESS = 0.87;
const MAX_LIGHTNESS = 0.95;
const MAX_CHROMA = 0.15;

/// Deterministic, "interesting" mesh-blob background for `GalleryCardBanner`
/// (course banners) — hashed from the course's *name*, so a rename gets a
/// new look. Several small radial-gradient "dots," each fading to transparent
/// (no `filter: blur()` needed — the soft falloff already reads as blurred,
/// and doesn't blur the icon sitting on top of it), scattered and overlapping
/// so they bleed into each other and into a pastel base fill. No gradient
/// library needed: a hash-seeded PRNG picking hue/position/radius is ~30
/// lines and keeps the bundle smaller than pulling one in for this.
///
/// `oklch()` rather than `hsl()` — perceptually-uniform lightness/chroma
/// means a fixed L/C band actually stays even across every hue, where
/// `hsl()`'s same fixed S/L still swings wildly in perceived
/// brightness/saturation hue to hue (e.g. yellow vs. blue at "60%, 40%").
/// Pastel: high lightness, low chroma — soft rather than "hostile"/vivid.
/// Callers pairing this with an icon/overlay should use a dark, theme
/// -independent color (not white) since the banner itself is always light
/// now, regardless of app light/dark theme.
/// Every blob's hue stays within a tight ~24° spread of one base hue —
/// genuinely neighbouring colors (e.g. blue-cyan-teal), never a wide spread
/// that could land two blobs on opposing/clashing hues (red+blue, green+purple).
export function gradientForName(name: string): string {
  const rand = mulberry32(hashString(name));

  const baseHue = pickHue(rand);
  const hueSpread = 24;
  // Fixed chroma, lightness only nudged slightly per blob — keeps every dot
  // in the same soft pastel band instead of drifting muddy/neon.
  const chroma = MAX_CHROMA;

  const blobs = Array.from({ length: BLOB_COUNT }, (_, i) => {
    const hue = (baseHue + (i - (BLOB_COUNT - 1) / 2) * (hueSpread / (BLOB_COUNT - 1)) + 360) % 360;
    const lightness = MIN_LIGHTNESS + rand() * (MAX_LIGHTNESS - MIN_LIGHTNESS);
    const x = Math.floor(rand() * 100);
    const y = Math.floor(rand() * 100);
    // Big and pushed well past their own nominal radius before going fully
    // transparent (`transparent 150%`, not `100%`) — stretches the fade over
    // a much wider area so it reads as heavily blurred rather than a
    // soft-edged disc, and overlaps its neighbours more to bleed together.
    const radius = 70 + Math.floor(rand() * 50);
    const color = `oklch(${lightness.toFixed(2)} ${chroma} ${Math.round(hue)})`;
    return `radial-gradient(${radius}px circle at ${x}% ${y}%, ${color}, transparent 150%)`;
  });

  const baseColor = `oklch(${MAX_LIGHTNESS} ${chroma * 0.4} ${Math.round(baseHue)})`;
  return `${blobs.join(", ")}, ${baseColor}`;
}
