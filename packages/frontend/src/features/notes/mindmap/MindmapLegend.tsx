import { CodeLegend } from "../code-legend";

/// A reminder of the mind map outline format, shown below the code.
export function MindmapLegend() {
  return (
    <CodeLegend summary={<>One idea per line, indented under the idea it belongs to</>}>
      <p>
        The first line is the middle of the map and the lines indented under it are its branches.
        Indent with two spaces or a tab, as deep as you like. A leading <code>-</code> or{" "}
        <code>*</code> is fine, so a pasted list works as it is.
      </p>
      <p>
        Several lines that are not indented make separate maps, one below the other. In the preview,
        click an idea with branches to fold or open them, or drag it to move it with everything
        under it. Reset layout brings back the automatic layout. Neither changes the outline.
      </p>
    </CodeLegend>
  );
}
