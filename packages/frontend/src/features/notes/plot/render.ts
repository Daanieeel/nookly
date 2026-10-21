import { drawPlot } from "./draw";
import { PlotError, parsePlot } from "./parse";

/// Draws the plot block's code into `element`, resolving to what is wrong with the
/// code, or `null` when it drew.
export function renderPlot(
  source: string,
  element: HTMLElement,
  dark: boolean,
): Promise<string | null> {
  try {
    element.innerHTML = drawPlot(parsePlot(source), dark);
    return Promise.resolve(null);
  } catch (error) {
    element.innerHTML = "";
    if (error instanceof PlotError) return Promise.resolve(error.message);
    throw error;
  }
}
