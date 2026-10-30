import { drawPlot, type FormulaRenderer } from "./draw";
import { loadFormulas } from "./formula";
import { PlotError, parsePlot } from "./parse";

/// The legend's formulas, once they have loaded.
let formulas: FormulaRenderer | undefined;
/// The latest drawing into each element, so a slow load does not paint over a newer one.
const latest = new WeakMap<HTMLElement, symbol>();

/// Draws the plot block's code into `element`, resolving to what is wrong with the
/// code, or `null` when it drew. The first plot shows its legend as typed and swaps in
/// the formulas when they have loaded.
export async function renderPlot(
  source: string,
  element: HTMLElement,
  dark: boolean,
): Promise<string | null> {
  const mine = Symbol();
  latest.set(element, mine);
  try {
    const plot = parsePlot(source);
    element.innerHTML = drawPlot(plot, dark, formulas);
    if (!formulas) {
      formulas = await loadFormulas().catch(() => undefined);
      if (formulas && latest.get(element) === mine) {
        element.innerHTML = drawPlot(plot, dark, formulas);
      }
    }
    return null;
  } catch (error) {
    element.innerHTML = "";
    if (error instanceof PlotError) return error.message;
    throw error;
  }
}
