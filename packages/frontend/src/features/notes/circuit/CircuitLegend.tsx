import { CodeLegend } from "../code-legend";

/// A reminder of the circuit code format, shown below the code.
export function CircuitLegend() {
  return (
    <CodeLegend
      summary={
        <>
          <code>Y = A &amp; !B</code> · <code>!</code> not · <code>&amp;</code> and · <code>|</code>{" "}
          or · <code>^</code> xor
        </>
      }
    >
      <p>
        One line per gate or output: <code>name = expression</code>, or just an expression. A name
        nobody assigns is an input.
      </p>
      <p>
        Also <code>NAND</code>, <code>NOR</code>, <code>XNOR</code>. Group with brackets:{" "}
        <code>Y = (A | B) &amp; C</code>.
      </p>
      <p>
        A NOT gate of its own: <code>Y = !A</code> or <code>Y = !(A &amp; B)</code>. Inside a bigger
        expression, <code>!A &amp; B</code> draws a bubble on the pin instead.
      </p>
      <p>
        Example: <code>x = A &amp; B</code> then <code>Y = x | !C</code>
      </p>
    </CodeLegend>
  );
}
