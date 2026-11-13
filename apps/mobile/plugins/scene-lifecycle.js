// iOS 27 stops any app at launch that has not adopted the scene lifecycle. Expo 57 ships the scene
// delegate (EXExpoAppSceneDelegate) but its project template still builds the window in the app
// delegate, so this plugin moves the window to the scene delegate when the native project is made.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const CLASS_LINE = "class AppDelegate: ExpoAppDelegate {";
const PROVIDER_LINE = "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {";
// The template's own window and start up; under scenes Expo's scene delegate does both.
const WINDOW_BLOCK =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function adoptSceneAppDelegate(source) {
  if (source.includes(PROVIDER_LINE)) return source;
  if (!source.includes(CLASS_LINE) || !WINDOW_BLOCK.test(source)) {
    throw new Error(
      "scene-lifecycle: the generated AppDelegate.swift changed shape; update plugins/scene-lifecycle.js",
    );
  }
  return source.replace(CLASS_LINE, PROVIDER_LINE).replace(WINDOW_BLOCK, "\n");
}

function sceneManifest() {
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: "Default Configuration",
          UISceneDelegateClassName: "EXExpoAppSceneDelegate",
        },
      ],
    },
  };
}

function withSceneLifecycle(config) {
  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("scene-lifecycle: expected a Swift AppDelegate");
    }
    mod.modResults.contents = adoptSceneAppDelegate(mod.modResults.contents);
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = sceneManifest();
    return mod;
  });
}

module.exports = withSceneLifecycle;
module.exports.adoptSceneAppDelegate = adoptSceneAppDelegate;
module.exports.sceneManifest = sceneManifest;
