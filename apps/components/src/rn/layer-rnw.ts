// react-native-web writes its styles as plain rules, which beat anything in a CSS layer, and
// Tailwind's classes are in layers. Its rules go into a layer of their own, the lowest, so a
// class on a component wins over the black text and the blank boxes it starts from.
const insertRule = CSSStyleSheet.prototype.insertRule;

CSSStyleSheet.prototype.insertRule = function (rule: string, index?: number) {
  const owner = this.ownerNode;
  if (owner instanceof Element && owner.id === "react-native-stylesheet" && !rule.startsWith("@")) {
    return insertRule.call(this, `@layer rnw { ${rule} }`, index);
  }
  return insertRule.call(this, rule, index);
};

// react-native-svg writes a circle's `origin` as `transform-origin`, which React calls a typo
// for a property it knows. Nothing is wrong and nothing can be done in the gallery about it.
const consoleError = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("Invalid DOM property") &&
    String(args[1]).includes("transform-origin")
  ) {
    return;
  }
  consoleError(...args);
};
