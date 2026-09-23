/// How a link plays inline: the iframe URL and the frame's shape. Only services
/// that offer an embeddable player are listed; most other sites refuse to be
/// framed, so they show as a link instead.
export interface EmbedTarget {
  provider: string;
  src: string;
  /// CSS aspect ratio, or a fixed height in pixels for players with one.
  aspect: string | null;
  height: number | null;
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function embedTarget(url: string): EmbedTarget | null {
  const parsed = parse(url.trim());
  if (!parsed || !/^https?:$/.test(parsed.protocol)) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  const path = parsed.pathname;

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    const id =
      host === "youtu.be"
        ? path.slice(1)
        : path.startsWith("/shorts/") || path.startsWith("/embed/")
          ? path.split("/")[2]
          : parsed.searchParams.get("v");
    if (!id) return null;
    const start = parsed.searchParams.get("t")?.replace(/s$/, "");
    const query = start && /^\d+$/.test(start) ? `?start=${start}` : "";
    return {
      provider: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${id}${query}`,
      aspect: "16 / 9",
      height: null,
    };
  }
  if (host === "vimeo.com") {
    const id = path.split("/").find((part) => /^\d+$/.test(part));
    return id
      ? {
          provider: "Vimeo",
          src: `https://player.vimeo.com/video/${id}`,
          aspect: "16 / 9",
          height: null,
        }
      : null;
  }
  if (host === "loom.com" && path.startsWith("/share/")) {
    return {
      provider: "Loom",
      src: `https://www.loom.com/embed/${path.split("/")[2]}`,
      aspect: "16 / 9",
      height: null,
    };
  }
  if (host === "figma.com") {
    return {
      provider: "Figma",
      src: `https://www.figma.com/embed?embed_host=nookly&url=${encodeURIComponent(url.trim())}`,
      aspect: "4 / 3",
      height: null,
    };
  }
  if ((host === "google.com" || host.endsWith(".google.com")) && path.startsWith("/maps")) {
    return {
      provider: "Google Maps",
      src: `https://maps.google.com/maps?q=${encodeURIComponent(parsed.searchParams.get("q") ?? path.split("/")[3] ?? "")}&output=embed`,
      aspect: "16 / 9",
      height: null,
    };
  }
  if (host === "open.spotify.com") {
    const compact = path.startsWith("/track/") || path.startsWith("/episode/");
    return {
      provider: "Spotify",
      src: `https://open.spotify.com/embed${path}`,
      aspect: null,
      height: compact ? 80 : 380,
    };
  }
  if (host === "codepen.io" && path.includes("/pen/")) {
    return {
      provider: "CodePen",
      src: `https://codepen.io${path.replace("/pen/", "/embed/")}?default-tab=result`,
      aspect: null,
      height: 400,
    };
  }
  return null;
}
