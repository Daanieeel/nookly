import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

/// Children that take files dragged in from another app (Files, Photos, Safari): each is
/// copied into the app's temporary folder and handed over as `onFilesDropped`, with
/// `onDropActive` while a drag hovers over it.
class NooklyFileDropView: ExpoView, UIDropInteractionDelegate {
  let onFilesDropped = EventDispatcher()
  let onDropActive = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIDropInteraction(delegate: self))
  }

  func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
    session.hasItemsConforming(toTypeIdentifiers: [UTType.item.identifier])
  }

  func dropInteraction(
    _ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession
  ) -> UIDropProposal {
    UIDropProposal(operation: .copy)
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: UIDropSession) {
    onDropActive(["active": true])
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: UIDropSession) {
    onDropActive(["active": false])
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: UIDropSession) {
    onDropActive(["active": false])
  }

  func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    let group = DispatchGroup()
    var files: [[String: String]] = []
    let lock = NSLock()
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
      "dropped-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    for item in session.items {
      let provider = item.itemProvider
      guard let type = provider.registeredTypeIdentifiers.first else { continue }
      group.enter()
      provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
        defer { group.leave() }
        guard let url else { return }
        let name = provider.suggestedName.map { name in
          url.pathExtension.isEmpty || name.hasSuffix(".\(url.pathExtension)")
            ? name : "\(name).\(url.pathExtension)"
        } ?? url.lastPathComponent
        let target = folder.appendingPathComponent(name)
        // The system deletes `url` once this returns: keep a copy.
        guard (try? FileManager.default.copyItem(at: url, to: target)) != nil else { return }
        lock.lock()
        files.append(["uri": target.absoluteString, "name": name])
        lock.unlock()
      }
    }
    group.notify(queue: .main) { [weak self] in
      self?.onFilesDropped(["files": files])
    }
  }
}
