"use dom";
/// <reference lib="dom" />

import type { DOMProps } from "expo/dom";

/// A formula drawn as MathML in a small web view, sized to what it draws.
export default function MathDom({
  markup,
  color,
  fontSize,
}: {
  markup: string;
  color: string;
  fontSize: number;
  dom?: DOMProps;
}) {
  return (
    <>
      <style>{`html, body { margin: 0; background: transparent; -webkit-text-size-adjust: 100%; }
body { display: flex; justify-content: center; color: ${color}; font-size: ${fontSize}px; }
math { font-size: 1.15em; }
.math-error { font: 0.8em ui-monospace, Menlo, monospace; opacity: 0.7; }`}</style>
      {/* SAFETY: KaTeX writes this from the person's own formula with `trust: false`. */}
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
