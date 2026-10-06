import type { Prim } from "./draw";

/// A drawing primitive as an SVG element, the React twin of the SVG text `drawCircuit` prints.
export function PrimView({ prim }: { prim: Prim }) {
  switch (prim.t) {
    case "path":
      return <path d={prim.d} strokeWidth={prim.strokeWidth} />;
    case "circle":
      return (
        <circle
          cx={prim.cx}
          cy={prim.cy}
          r={prim.r}
          {...(prim.filled ? { fill: "currentColor", stroke: "none" } : {})}
        />
      );
    case "text":
      return (
        <text
          x={prim.x}
          y={prim.y}
          fontSize={prim.size}
          fontStyle={prim.italic ? "italic" : undefined}
          textAnchor={prim.anchor === "end" ? "end" : undefined}
          fill="currentColor"
          stroke="none"
        >
          {prim.text}
        </text>
      );
    case "group":
      return (
        <g transform={`translate(${prim.x} ${prim.y})`}>
          {prim.children.map((child, index) => (
            <PrimView key={index} prim={child} />
          ))}
        </g>
      );
  }
}
