import { describe, expect, it } from "@jest/globals";

import { quoteBundleScript } from "../plugins/bundle-script-path";

// The last line of the bundle phase Expo 57 generates: an unquoted command substitution, so a
// project folder with a space in its path ("Open Source") splits into two words and fails.
const TEMPLATE = `export BUNDLE_COMMAND="export:embed"
fi

\`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"\`

`;

describe("bundle script path plugin", () => {
  it("runs the React Native bundle script through a quoted path", () => {
    const out = quoteBundleScript(TEMPLATE);
    expect(out).not.toMatch(/^`/m);
    expect(out).toContain('RN_XCODE_SCRIPT="$("$NODE_BINARY" --print');
    expect(out).toContain('"$RN_XCODE_SCRIPT"');
  });

  it("leaves an already quoted script alone", () => {
    const once = quoteBundleScript(TEMPLATE);
    expect(quoteBundleScript(once)).toBe(once);
  });

  it("fails loudly when the generated script changes shape", () => {
    expect(() => quoteBundleScript("echo hi\n")).toThrow(/bundle-script-path/);
  });
});
