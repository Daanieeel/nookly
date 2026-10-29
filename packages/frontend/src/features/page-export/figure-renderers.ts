import { convertFileSrc } from "@tauri-apps/api/core";
import { renderDiagram } from "#/features/notes/diagram.ts";
import { drawCircuit } from "#/features/notes/circuit/draw.ts";
import { layoutCircuit } from "#/features/notes/circuit/layout.ts";
import { parseCircuit } from "#/features/notes/circuit/parse.ts";
import { drawPlot } from "#/features/notes/plot/draw.ts";
import { parsePlot } from "#/features/notes/plot/parse.ts";
import { latexMacros } from "#/features/notes/math.ts";
import { getBookmark } from "#/lib/api/bookmarks.ts";
import { getFile } from "#/lib/api/files.ts";
import { checkLocalPath } from "#/lib/api/local-files.ts";
import { fileUrl } from "#/features/notes/media-target.ts";
import type { ExportImage } from "./document-model.ts";
import { COLORS } from "./print-style.ts";
import type { FigureRenderers } from "./resolve-document.ts";

/// Pictures are drawn at this many pixels per CSS pixel, so they stay sharp in print.
const SCALE = 3;
/// The largest side a photo keeps, in pixels; a bigger one only makes the file heavier.
const MAX_PHOTO_SIDE = 2400;
/// Fonts every system has, so a diagram's text is measured and drawn in the same font.
const SYSTEM_FONTS = "Helvetica, Arial, sans-serif";
/// MathJax sizes in `ex`, eight pixels each at its 16px em.
const EX_PX = 8;

function lengthPx(value: string | null): number | null {
  if (!value) return null;
  const match = /^([\d.]+)(px|ex|pt)?$/.exec(value.trim());
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return match[2] === "ex" ? n * EX_PX : match[2] === "pt" ? n / 0.75 : n;
}

/// The size an SVG shows at: its width and height when they are lengths, else its viewBox.
export function svgSize(svg: SVGSVGElement): { width: number; height: number } | null {
  const width = lengthPx(svg.getAttribute("width"));
  const height = lengthPx(svg.getAttribute("height"));
  if (width && height) return { width, height };
  const box = svg
    .getAttribute("viewBox")
    ?.split(/[\s,]+/)
    .map(Number);
  if (box?.length === 4 && box[2] && box[3]) return { width: box[2], height: box[3] };
  return null;
}

/// How far an SVG reaches below the text line: MathJax lowers a formula with a negative
/// `vertical-align`, in `ex`.
export function svgDepth(svg: SVGSVGElement): number {
  const lowered = lengthPx(svg.style.verticalAlign.replace(/^-/, ""));
  return svg.style.verticalAlign.startsWith("-") && lowered ? lowered : 0;
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("couldn't draw the picture"));
      else void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/png"),
  );
}

async function drawToPng(src: string, width: number, height: number, scale: number) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasPng(canvas);
}

/// An SVG drawn into a PNG, in the print text color wherever it says `currentColor`.
export async function svgToPng(markup: string): Promise<ExportImage | null> {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = parsed.documentElement;
  if (!(svg instanceof SVGSVGElement)) return null;
  const size = svgSize(svg);
  if (!size) return null;
  const depth = svgDepth(svg);
  svg.setAttribute("width", String(size.width));
  svg.setAttribute("height", String(size.height));
  svg.setAttribute("color", `#${COLORS.text}`);
  svg.style.color = `#${COLORS.text}`;
  svg.style.maxWidth = "none";
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const png = await drawToPng(url, size.width, size.height, SCALE);
    return { png, ...size, ...(depth > 0 && { depth }) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/// Any picture the webview can show, as a PNG no larger than `MAX_PHOTO_SIDE`.
async function photoToPng(blob: Blob): Promise<ExportImage> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const shrink = Math.min(1, MAX_PHOTO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = img.naturalWidth * shrink;
    const height = img.naturalHeight * shrink;
    // Shown at half its pixels, like a photo on a sharp screen.
    return { png: await drawToPng(url, width, height, 1), width: width / 2, height: height / 2 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`couldn't load ${url}`);
  return response.blob();
}

export { fileUrl };

export const appFigureRenderers: FigureRenderers = {
  math: async (latex, inline) => {
    const { texToSvg } = await import("./mathjax-svg.ts");
    return svgToPng(texToSvg(latex, !inline, latexMacros()));
  },
  diagram: async (source) => {
    const element = document.createElement("div");
    const error = await renderDiagram(source, element, false, {
      theme: "neutral",
      fontFamily: SYSTEM_FONTS,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    return error ? null : svgToPng(element.innerHTML);
  },
  circuit: async (source) => svgToPng(drawCircuit(layoutCircuit(parseCircuit(source)))),
  plot: async (source) => svgToPng(drawPlot(parsePlot(source), false)),
  image: async ({ fileId, url, path: localPath }) => {
    // A file on this computer, when it is there: a missing one leaves the caption instead.
    if (localPath) {
      const found = await checkLocalPath(localPath).catch(() => null);
      return found?.state === "ok" ? photoToPng(await fetchBlob(convertFileSrc(localPath))) : null;
    }
    if (fileId) {
      const file = await getFile(fileId);
      const path = file.localPath ?? file.sourcePath;
      const src = path ? convertFileSrc(path) : file.url;
      return src ? photoToPng(await fetchBlob(src)) : null;
    }
    return url ? photoToPng(await fetchBlob(url)) : null;
  },
  mentionUrl: async (id) => {
    const file = await getFile(id).catch(() => null);
    if (file) {
      const path = file.localPath ?? file.sourcePath;
      return path ? fileUrl(path) : file.url;
    }
    const bookmark = await getBookmark(id).catch(() => null);
    return bookmark?.url ?? null;
  },
};
