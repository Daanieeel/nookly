import type { Plot } from "./parse";

/// The picture's size in CSS pixels. It scales down to the page width.
const PLOT_WIDTH = 640;
const PLOT_HEIGHT = 400;

/// The curves' colors in order, the text colors' shades for a light and a dark page.
const COLORS = {
  light: ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#db2777"],
  dark: ["#60a5fa", "#f87171", "#4ade80", "#a78bfa", "#fb923c", "#f472b6"],
};

/// The window when the code names none: -10 to 10 across.
const DEFAULT_SPAN = 20;

type Range = [number, number];

/// The part of the plane a plot shows.
interface PlotView {
  x: Range;
  y: Range;
}

/// What the picture shows, in plot units. An axis the code leaves out keeps the other
/// axis's scale, so a circle stays round; points outside the default window widen it.
export function plotWindow(plot: Plot, width: number, height: number): PlotView {
  const { x, y } = plot.window;
  if (x && y) return { x, y };
  if (x) return { x, y: around(0, ((x[1] - x[0]) * height) / width) };
  if (y) return { x: around(0, ((y[1] - y[0]) * width) / height), y };
  let xs: Range = around(0, DEFAULT_SPAN);
  let ys: Range = around(0, (DEFAULT_SPAN * height) / width);
  for (const p of plot.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    xs = [Math.min(xs[0], p.x - 1), Math.max(xs[1], p.x + 1)];
    ys = [Math.min(ys[0], p.y - 1), Math.max(ys[1], p.y + 1)];
  }
  // One scale for both axes: the larger one, each axis centered on what it must show.
  const unit = Math.max((xs[1] - xs[0]) / width, (ys[1] - ys[0]) / height);
  return {
    x: around((xs[0] + xs[1]) / 2, unit * width),
    y: around((ys[0] + ys[1]) / 2, unit * height),
  };
}

const around = (center: number, span: number): Range => [center - span / 2, center + span / 2];

/// The distance between grid lines for `span` units: 1, 2 or 5 times a power of ten,
/// whichever puts closest to ten lines across.
export function gridStep(span: number): number {
  const raw = span / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1, 2, 5, 10].map((m) => m * power);
  let best = candidates[0] ?? 1;
  for (const c of candidates) {
    if (Math.abs(Math.log(c / raw)) < Math.abs(Math.log(best / raw))) best = c;
  }
  return best;
}

/// A grid number, with only the decimals its step needs and no `-0`.
function tickLabel(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const text = Number(value.toFixed(decimals)).toString();
  return text === "-0" ? "0" : text;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (value: number) => (Math.round(value * 10) / 10).toString();

/// Multiples of `step` inside `range`.
function ticks([from, to]: Range, step: number): number[] {
  const out: number[] = [];
  for (let i = Math.ceil(from / step); i * step <= to + step * 1e-9; i++) out.push(i * step);
  return out;
}

/// One function as a path, sampled twice per pixel. The pen lifts where the function is
/// undefined and at a pole, where the value leaps across the window between two samples
/// but the point between them does not lie between those values.
function curve(
  at: (x: number) => number,
  toX: (x: number) => number,
  fromX: (px: number) => number,
  toY: (y: number) => number,
  width: number,
  height: number,
): string {
  const samples = width * 2;
  const parts: string[] = [];
  let previous: { x: number; y: number; py: number } | null = null;
  for (let i = 0; i <= samples; i++) {
    const x = fromX((i * width) / samples);
    const y = at(x);
    if (!Number.isFinite(y)) {
      previous = null;
      continue;
    }
    // Far outside the window, a value is only a direction: drawn to just beyond the edge.
    const py = Math.max(-height, Math.min(2 * height, toY(y)));
    if (previous && Math.abs(py - previous.py) > height / 2) {
      const middle = at((previous.x + x) / 2);
      const low = Math.min(previous.y, y);
      const high = Math.max(previous.y, y);
      if (!(middle >= low && middle <= high)) previous = null;
    }
    parts.push(`${previous ? "L" : "M"}${n(toX(x))},${n(py)}`);
    previous = { x, y, py };
  }
  return parts.join("");
}

/// The plot as an SVG string: grid, axes with their numbers, the functions, vertical
/// lines and points, and a legend of the functions as typed. Text and axes are
/// `currentColor`, so the picture takes the color of the text around it.
export function drawPlot(
  plot: Plot,
  dark: boolean,
  width = PLOT_WIDTH,
  height = PLOT_HEIGHT,
): string {
  const window = plotWindow(plot, width, height);
  const toX = (x: number) => ((x - window.x[0]) / (window.x[1] - window.x[0])) * width;
  const toY = (y: number) => height - ((y - window.y[0]) / (window.y[1] - window.y[0])) * height;
  const fromX = (px: number) => window.x[0] + (px / width) * (window.x[1] - window.x[0]);
  const palette = dark ? COLORS.dark : COLORS.light;
  // Numbers and names sit on a halo of the page color, so a curve under them stays readable.
  const page = `var(--background, ${dark ? "#0a0a0a" : "#ffffff"})`;
  const halo = `style="stroke: ${page}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`;
  const color = (i: number) => palette[i % palette.length] ?? "currentColor";

  const xStep = gridStep(window.x[1] - window.x[0]);
  const yStep = gridStep(window.y[1] - window.y[0]);
  const xTicks = ticks(window.x, xStep);
  const yTicks = ticks(window.y, yStep);
  // An axis out of view still has its numbers, along the nearest edge.
  const axisY = Math.max(0, Math.min(height, toY(0)));
  const axisX = Math.max(0, Math.min(width, toX(0)));
  const xLabelY = Math.min(height - 4, axisY + 14);
  const yLabelX = Math.max(axisX - 5, 18);

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
      `style="max-width:100%;height:auto" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="none">`,
    `<g stroke="currentColor" stroke-opacity="0.12" stroke-width="1">`,
    ...xTicks.map((x) => `<line x1="${n(toX(x))}" y1="0" x2="${n(toX(x))}" y2="${height}"/>`),
    ...yTicks.map((y) => `<line x1="0" y1="${n(toY(y))}" x2="${width}" y2="${n(toY(y))}"/>`),
    `</g>`,
    `<g stroke="currentColor" stroke-opacity="0.6" stroke-width="1.25">`,
    `<line x1="0" y1="${n(axisY)}" x2="${width}" y2="${n(axisY)}"/>`,
    `<line x1="${n(axisX)}" y1="0" x2="${n(axisX)}" y2="${height}"/>`,
    `</g>`,
  ];

  plot.verticals.forEach((line, i) => {
    const x = n(toX(line.x));
    out.push(
      `<line data-vertical="" x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${color(plot.functions.length + i)}" stroke-width="2"/>`,
    );
  });
  plot.functions.forEach((fn, i) => {
    const d = curve(fn.at, toX, fromX, toY, width, height);
    out.push(
      `<path data-function="" d="${d}" stroke="${color(i)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  });
  for (const p of plot.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const cx = n(toX(p.x));
    const cy = n(toY(p.y));
    out.push(`<circle data-point="" cx="${cx}" cy="${cy}" r="4" fill="currentColor"/>`);
    if (p.name) {
      out.push(
        `<text x="${n(toX(p.x) + 7)}" y="${n(toY(p.y) - 7)}" fill="currentColor" font-size="12" font-weight="600" ${halo}>${escapeXml(p.name)}</text>`,
      );
    }
  }

  // The numbers go over the curves, on their halo.
  out.push(
    `<g fill="currentColor" fill-opacity="0.7" ${halo}>`,
    // Numbers too close to an edge would be cut off.
    ...xTicks
      .filter((x) => Math.abs(x) > xStep / 2 && toX(x) > 12 && toX(x) < width - 12)
      .map(
        (x) =>
          `<text x="${n(toX(x))}" y="${n(xLabelY)}" text-anchor="middle">${tickLabel(x, xStep)}</text>`,
      ),
    ...yTicks
      .filter((y) => Math.abs(y) > yStep / 2 && toY(y) > 10 && toY(y) < height - 10)
      .map(
        (y) =>
          `<text x="${n(yLabelX)}" y="${n(toY(y) + 4)}" text-anchor="end">${tickLabel(y, yStep)}</text>`,
      ),
    `<text x="${n(yLabelX)}" y="${n(xLabelY)}" text-anchor="end">0</text>`,
    `</g>`,
  );

  // The legend: what each colored line is, as typed, over a patch of the page.
  const entries = [
    ...plot.functions.map((fn, i) => ({ label: fn.label, color: color(i) })),
    ...plot.verticals.map((line, i) => ({
      label: line.label,
      color: color(plot.functions.length + i),
    })),
  ];
  if (entries.length > 0) {
    const rowHeight = 18;
    const longest = Math.max(...entries.map((e) => e.label.length));
    const boxWidth = Math.min(width - 16, 34 + longest * 6.6);
    out.push(
      `<rect x="8" y="8" width="${n(boxWidth)}" height="${entries.length * rowHeight + 8}" rx="6" ` +
        `style="fill: ${page}" fill-opacity="0.9" stroke="currentColor" stroke-opacity="0.15"/>`,
    );
    entries.forEach((entry, i) => {
      const y = 8 + 4 + i * rowHeight + rowHeight / 2;
      out.push(
        `<line x1="16" y1="${y}" x2="30" y2="${y}" stroke="${entry.color}" stroke-width="2.5" stroke-linecap="round"/>`,
        `<text x="36" y="${y + 4}" fill="currentColor" stroke="none" font-size="12">${escapeXml(entry.label)}</text>`,
      );
    });
  }
  out.push(`</svg>`);
  return out.join("");
}
