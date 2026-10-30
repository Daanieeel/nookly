import { CodeLegend } from "../code-legend";

/// A reminder of the plot code format, shown below the code.
export function PlotLegend() {
  return (
    <CodeLegend
      summary={
        <>
          <code>f(x) = x^2 - 2</code> · <code>A = (1, 2)</code> · <code>window: -5..5</code>
        </>
      }
    >
      <p>
        One line each. A function: <code>f(x) = 2x + 1</code>, <code>y = sin(x)</code> or just{" "}
        <code>x^3</code>. A line without a variable: <code>z_1 = 2</code>. A constant the other
        lines can use: <code>a = 3</code>; when no line uses it, it is drawn as a line too.
      </p>
      <p>
        A point: <code>A = (2, f(2))</code>. A vertical line: <code>x = 4</code>. A vector between
        two points, named or written out: <code>(0, 0) -&gt; A</code> or <code>A -&gt; B</code>.
        <code>0</code> is the origin. The window, across and optionally up and down:{" "}
        <code>window: -5..5</code> or <code>window: -5..5, -2..8</code>.
      </p>
      <p>
        Name a vector with <code>a = 0 -&gt; A</code>, then add and subtract by name:{" "}
        <code>a + b</code>, <code>a - b</code> or <code>c = a + b</code>. A sum starts where its
        first vector starts.
      </p>
      <p>
        <code>+ - * / ^</code>, brackets, <code>2x</code> for 2 times x, <code>pi</code>,{" "}
        <code>e</code>, <code>sqrt</code>, <code>abs</code>, <code>sin</code>, <code>cos</code>,{" "}
        <code>tan</code>, <code>ln</code>, <code>log</code>, <code>exp</code>, <code>min</code>,{" "}
        <code>max</code>. <code>#</code> starts a comment. A line that starts with <code>!#</code>{" "}
        still works, so others can use it, but the plot does not show it.
      </p>
    </CodeLegend>
  );
}
