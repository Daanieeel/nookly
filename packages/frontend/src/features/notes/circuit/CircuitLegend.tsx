import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";

/// A reminder of the circuit code format, shown below the code: the essentials on
/// one line, the rest behind a toggle.
export function CircuitLegend() {
  const [open, setOpen] = useState(false);
  const Eye = open ? IconEyeOff : IconEye;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate">
          <code>Y = A &amp; !B</code> · <code>!</code> not · <code>&amp;</code> and · <code>|</code>{" "}
          or · <code>^</code> xor
        </p>
        <Button
          variant="linkMuted"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="h-auto shrink-0 gap-1 self-center p-0 leading-none font-normal hover:no-underline"
        >
          <Eye className="size-3.5" />
          {open ? "Hide details" : "Show details"}
        </Button>
      </div>
      {open && (
        <>
          <p>
            One line per gate or output: <code>name = expression</code>, or just an expression. A
            name nobody assigns is an input.
          </p>
          <p>
            Also <code>NAND</code>, <code>NOR</code>, <code>XNOR</code>. Group with brackets:{" "}
            <code>Y = (A | B) &amp; C</code>.
          </p>
          <p>
            A NOT gate of its own: <code>Y = !A</code> or <code>Y = !(A &amp; B)</code>. Inside a
            bigger expression, <code>!A &amp; B</code> draws a bubble on the pin instead.
          </p>
          <p>
            Example: <code>x = A &amp; B</code> then <code>Y = x | !C</code>
          </p>
        </>
      )}
    </>
  );
}
