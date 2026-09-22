/// Deterministic per-id color for `GalleryCardBanner` — same idea as the
/// mascot's per-day seeding (`src/components/mascot-figure.tsx`), just
/// id-keyed instead of date-keyed, so a course's banner color is stable
/// across sessions without being stored anywhere.
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  // Fixed saturation/lightness band: vivid enough to read as "colorful" but
  // dark enough that the banner's white icon/overlay stays legible in both
  // themes (the banner itself doesn't change with light/dark).
  return `hsl(${hue}, 55%, 42%)`;
}
