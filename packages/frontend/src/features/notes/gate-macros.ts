/// Logic gate operators, which LaTeX has no commands for: `A \nand B`. The negated
/// gates are the plain symbol with a bar over it.
export const GATE_MACROS = {
  "\\xor": "\\mathbin{\\oplus}",
  "\\nand": "\\mathbin{\\overline{\\wedge}}",
  "\\nor": "\\mathbin{\\overline{\\vee}}",
  "\\xnor": "\\mathbin{\\overline{\\oplus}}",
};
