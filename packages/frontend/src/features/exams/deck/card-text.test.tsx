import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardText, hasMarkup, splitCardText } from "./card-text.tsx";

describe("splitCardText", () => {
  it("keeps plain text whole", () => {
    expect(splitCardText("Hello there")).toEqual([{ kind: "text", value: "Hello there" }]);
  });

  it("reads inline and display math in the dollar, bracket and parenthesis spellings", () => {
    expect(splitCardText("a $x^2$ b")).toEqual([
      { kind: "text", value: "a " },
      { kind: "math", latex: "x^2", display: false },
      { kind: "text", value: " b" },
    ]);
    expect(splitCardText("$$\\sum_i x_i$$")).toEqual([
      { kind: "math", latex: "\\sum_i x_i", display: true },
    ]);
    expect(splitCardText("\\(a+b\\) and \\[c+d\\]")).toEqual([
      { kind: "math", latex: "a+b", display: false },
      { kind: "text", value: " and " },
      { kind: "math", latex: "c+d", display: true },
    ]);
  });

  it("lets display math run over several lines", () => {
    expect(splitCardText("$$\na = b\\\\\nc = d\n$$")).toEqual([
      { kind: "math", latex: "\na = b\\\\\nc = d\n", display: true },
    ]);
  });

  it("leaves dollar amounts in prose alone", () => {
    expect(splitCardText("It costs $5 and $10 today")).toEqual([
      { kind: "text", value: "It costs $5 and $10 today" },
    ]);
    expect(splitCardText("$ x $")).toEqual([{ kind: "text", value: "$ x $" }]);
  });

  it("shows an escaped dollar as a plain one", () => {
    expect(splitCardText("pay \\$3 or \\$4")).toEqual([{ kind: "text", value: "pay $3 or $4" }]);
  });

  it("keeps a dollar inside code as it is", () => {
    expect(splitCardText("`$x$`")).toEqual([{ kind: "code", value: "$x$" }]);
  });

  it("reads math inside bold and italic", () => {
    expect(splitCardText("**see $x$**")).toEqual([
      {
        kind: "bold",
        children: [
          { kind: "text", value: "see " },
          { kind: "math", latex: "x", display: false },
        ],
      },
    ]);
    expect(splitCardText("*$y$*")).toEqual([
      { kind: "italic", children: [{ kind: "math", latex: "y", display: false }] },
    ]);
  });
});

describe("hasMarkup", () => {
  it("is true only when something is formatted", () => {
    expect(hasMarkup("Hello")).toBe(false);
    expect(hasMarkup("costs $5 and $10")).toBe(false);
    expect(hasMarkup("$x$")).toBe(true);
    expect(hasMarkup("some **bold**")).toBe(true);
  });
});

describe("CardText", () => {
  it("draws inline math with KaTeX", () => {
    const { container } = render(<CardText text="Euler: $e^{i\pi}+1=0$" />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector(".katex-display")).toBeNull();
  });

  it("draws display math as its own centred block", () => {
    const { container } = render(<CardText text={"Sum:\n$$\\sum_{i=1}^n i$$"} />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("draws chemistry with \\ce", () => {
    const { container } = render(<CardText text="$\ce{H2O}$" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("shows a formula that does not parse as the text typed", () => {
    const { container } = render(<CardText text="$\frac{1$" />);
    expect(container.textContent).toBe("$\\frac{1$");
  });
});
