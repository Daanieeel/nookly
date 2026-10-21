import { CodeLegend } from "../code-legend";

/// A reminder of the plot code format, shown below the code.
export function PlotLegend() {
  return (
    <CodeLegend
      summary={
        <>
          <code>f(x) = x^2 - 2</code> · <code>A = (1, 2)</code> · <code>x: -5..5</code> window
        </>
      }
    >
      <p>
        One line each. A function: <code>f(x) = 2x + 1</code>, <code>y = sin(x)</code> or just{" "}
        <code>x^3</code>. A constant the other lines can use: <code>a = 3</code>.
      </p>
      <p>
        A point: <code>A = (2, f(2))</code>. A vertical line: <code>x = 4</code>. The window:{" "}
        <code>x: -5..5</code> and <code>y: -2..8</code>, each optional.
      </p>
      <p>
        <code>+ - * / ^</code>, brackets, <code>2x</code> for 2 times x, <code>pi</code>,{" "}
        <code>e</code>, <code>sqrt</code>, <code>abs</code>, <code>sin</code>, <code>cos</code>,{" "}
        <code>tan</code>, <code>ln</code>, <code>log</code>, <code>exp</code>, <code>min</code>,{" "}
        <code>max</code>. <code>#</code> starts a comment.
      </p>
    </CodeLegend>
  );
}
