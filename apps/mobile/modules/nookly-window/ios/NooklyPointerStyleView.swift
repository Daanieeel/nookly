import ExpoModulesCore
import UIKit

/// How the pointer of an iPad's trackpad or mouse looks over its children, as over
/// iPadOS's own controls: `button` takes the system's effect for a button of its size (a lift
/// or a highlight, rounded by `cornerRadius`), `resize` turns the pointer into a bar with
/// arrows to either side, for a divider dragged sideways. Touches pass through to the
/// children as before.
class NooklyPointerStyleView: ExpoView, UIPointerInteractionDelegate {
  var effect = "button"
  var cornerRadius: CGFloat = 8

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIPointerInteraction(delegate: self))
  }

  func pointerInteraction(
    _ interaction: UIPointerInteraction,
    styleFor region: UIPointerRegion
  ) -> UIPointerStyle? {
    if effect == "resize" {
      let bar = UIPointerShape.roundedRect(CGRect(x: -3, y: -12, width: 6, height: 24), radius: 3)
      let style = UIPointerStyle(shape: bar, constrainedAxes: [])
      style.accessories = [.arrow(.left), .arrow(.right)]
      return style
    }
    let parameters = UIPreviewParameters()
    parameters.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: cornerRadius)
    return UIPointerStyle(effect: .automatic(UITargetedPreview(view: self, parameters: parameters)))
  }
}
