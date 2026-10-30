import type { Formula, FormulaRenderer } from "./draw";

/// MathJax sizes a formula in `ex`, eight pixels each at its 16px em.
const EX_PX = 8;
const EM_PX = 16;

/// MathJax's `<svg>` as a `Formula` at `fontSize`, `null` when it has no size to read.
export function formulaOf(svg: string, fontSize: number): Formula | null {
  const open = /^<svg\b[^>]*>/.exec(svg)?.[0];
  const size = open && /\swidth="([\d.]+)ex"[^>]*\sheight="([\d.]+)ex"/.exec(open);
  if (!open || !size) return null;
  const scale = (EX_PX * fontSize) / EM_PX;
  const [width, height] = [Number(size[1]) * scale, Number(size[2]) * scale];
  const n = (value: number) => Math.round(value * 100) / 100;
  return {
    width,
    height,
    at: (x, y) =>
      svg.replace(
        open,
        open
          .replace(/\sstyle="[^"]*"/, "")
          .replace(/\swidth="[^"]*"/, ` x="${n(x)}" y="${n(y)}" width="${n(width)}"`)
          .replace(/\sheight="[^"]*"/, ` height="${n(height)}"`),
      ),
  };
}

/// Draws LaTeX with MathJax, which loads here the first time a plot needs it. A formula
/// MathJax can't read comes back `null`, so the legend falls back to the code as typed.
export async function loadFormulas(): Promise<FormulaRenderer> {
  const { texToSvg } = await import("#/features/page-export/mathjax-svg.ts");
  return (latex, fontSize) => {
    try {
      return formulaOf(texToSvg(latex, false, {}), fontSize);
    } catch {
      return null;
    }
  };
}
