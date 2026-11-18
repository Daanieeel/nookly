import ExpoModulesCore
import UIKit

/// Children that answer a secondary click: a right click on a mouse, or a two finger click
/// on a trackpad (`onSecondaryClick` with where it was, in the view's points). Touches pass
/// through to the children as before.
class NooklySecondaryClickView: ExpoView {
  let onSecondaryClick = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    let click = UITapGestureRecognizer(target: self, action: #selector(clicked(_:)))
    click.buttonMaskRequired = .secondary
    click.cancelsTouchesInView = false
    addGestureRecognizer(click)
  }

  @objc private func clicked(_ recognizer: UITapGestureRecognizer) {
    let point = recognizer.location(in: self)
    onSecondaryClick(["x": point.x, "y": point.y])
  }
}
