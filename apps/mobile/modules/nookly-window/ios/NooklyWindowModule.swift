import ExpoModulesCore
import UIKit

private func activeScene() -> UIWindowScene? {
  let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
  return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
}

private func keyWindow() -> UIWindow? {
  let scene = activeScene()
  return scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
}

public class NooklyWindowModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NooklyWindow")

    View(NooklySecondaryClickView.self) {
      ViewName("NooklySecondaryClickView")
      Events("onSecondaryClick")
    }

    /// Whether this build has `NooklyPointerStyleView`: an older one has not.
    Function("hasPointerStyle") { () -> Bool in true }

    View(NooklyPointerStyleView.self) {
      ViewName("NooklyPointerStyleView")
      Prop("effect") { (view: NooklyPointerStyleView, effect: String) in
        view.effect = effect
      }
      Prop("cornerRadius") { (view: NooklyPointerStyleView, radius: Double) in
        view.cornerRadius = CGFloat(radius)
      }
    }

    View(NooklyFileDropView.self) {
      ViewName("NooklyFileDropView")
      Events("onFilesDropped", "onDropActive")
    }

    /// The room iPadOS 26 and later keep at the window's top left for its close, minimise and
    /// resize controls, past the safe area: what a titlebar leaves free while they show
    /// (zero when the app fills the screen, or before iPadOS 26).
    Function("controlsInset") { () -> [String: Double] in
      var result: [String: Double] = ["left": 0, "top": 0]
      let read = {
        guard let view = keyWindow()?.rootViewController?.view else { return }
        if #available(iOS 26.0, *) {
          let adapted = view.edgeInsets(for: .margins(cornerAdaptation: .horizontal))
          let plain = view.edgeInsets(for: .margins())
          result["left"] = Double(max(0, adapted.left - plain.left))
          result["top"] = Double(max(0, adapted.top - plain.top))
        }
      }
      if Thread.isMainThread { read() } else { DispatchQueue.main.sync(execute: read) }
      return result
    }

    /// Turns the window, for checks on a simulator that has no window to turn by hand.
    /// Development only: the app calls it from its automation hooks alone.
    AsyncFunction("requestOrientation") { (name: String, promise: Promise) in
      DispatchQueue.main.async {
        guard let scene = activeScene() else {
          promise.reject("NO_SCENE", "No window to turn")
          return
        }
        let mask: UIInterfaceOrientationMask = name == "landscape" ? .landscapeRight : .portrait
        keyWindow()?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
          promise.reject("NOT_TURNED", error.localizedDescription)
        }
        // A window that may be any shape (multitasking) turns with the device: tell the
        // simulated device it turned, as its Rotate menu does.
        let device: UIDeviceOrientation = name == "landscape" ? .landscapeLeft : .portrait
        UIDevice.current.setValue(device.rawValue, forKey: "orientation")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { promise.resolve(nil) }
      }
    }
  }
}
