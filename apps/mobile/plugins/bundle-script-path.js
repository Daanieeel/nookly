// Expo's "Bundle React Native code and images" build phase ends with an unquoted command
// substitution that runs React Native's bundle script. A project folder with a space in its path
// (such as "Open Source") splits it into two words and the build fails. This plugin quotes the
// path when the native project is made.
const { withXcodeProject } = require("expo/config-plugins");

const PHASE_NAME = "Bundle React Native code and images";
const BACKTICK_LINE = /^`("\$NODE_BINARY" --print "[^`\n]*react-native-xcode\.sh'")`$/m;

function quoteBundleScript(script) {
  if (script.includes("RN_XCODE_SCRIPT=")) return script;
  if (!BACKTICK_LINE.test(script)) {
    throw new Error(
      "bundle-script-path: the generated bundle phase changed shape; update plugins/bundle-script-path.js",
    );
  }
  return script.replace(BACKTICK_LINE, 'RN_XCODE_SCRIPT="$($1)"\n"$RN_XCODE_SCRIPT"');
}

function withBundleScriptPath(config) {
  return withXcodeProject(config, (mod) => {
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const phase of Object.values(phases)) {
      if (phase?.name !== `"${PHASE_NAME}"`) continue;
      // The project file keeps the script as one quoted, escaped string.
      const raw = JSON.parse(phase.shellScript);
      phase.shellScript = JSON.stringify(quoteBundleScript(raw));
    }
    return mod;
  });
}

module.exports = withBundleScriptPath;
module.exports.quoteBundleScript = quoteBundleScript;
