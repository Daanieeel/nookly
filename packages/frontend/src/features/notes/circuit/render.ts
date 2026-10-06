import { drawCircuit } from "./draw";
import { layoutCircuit } from "./layout";
import { CircuitError, parseCircuit } from "./parse";

/// Draws the circuit block's code into `element`, resolving to what is wrong with
/// the code, or `null` when it drew.
export function renderCircuit(source: string, element: HTMLElement): Promise<string | null> {
  try {
    element.innerHTML = drawCircuit(layoutCircuit(parseCircuit(source)));
    return Promise.resolve(null);
  } catch (error) {
    element.innerHTML = "";
    if (error instanceof CircuitError) return Promise.resolve(error.message);
    throw error;
  }
}
