/// Colors for other people's carets, picked by their id so each keeps one on every
/// device.
const CARET_COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04"];

export function caretColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return CARET_COLORS[Math.abs(hash) % CARET_COLORS.length];
}

/// How a person shows in a page: "Ada on Mac", the device too so two devices of one
/// person tell apart.
export function presenceName(person: string, deviceName: string): string {
  return `${person} on ${deviceName.replace(/^Nookly on /, "")}`;
}
