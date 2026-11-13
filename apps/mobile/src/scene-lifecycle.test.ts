import { describe, expect, it } from "@jest/globals";

import { adoptSceneAppDelegate, sceneManifest } from "../plugins/scene-lifecycle";

// The AppDelegate the Expo 57 template generates, trimmed to the parts the plugin changes.
const TEMPLATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe("scene lifecycle plugin", () => {
  it("hands the window to Expo's scene delegate", () => {
    const out = adoptSceneAppDelegate(TEMPLATE);
    expect(out).toContain("class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
    expect(out).not.toContain("UIWindow(frame:");
    expect(out).not.toContain("startReactNative");
    expect(out).toContain("reactNativeFactory = factory");
  });

  it("runs twice without changing anything more", () => {
    const once = adoptSceneAppDelegate(TEMPLATE);
    expect(adoptSceneAppDelegate(once)).toBe(once);
  });

  it("fails loudly when the template no longer looks as expected", () => {
    expect(() => adoptSceneAppDelegate("class AppDelegate: Something {}")).toThrow(/AppDelegate/);
  });

  it("declares one window scene run by Expo's delegate", () => {
    expect(sceneManifest()).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    });
  });
});
