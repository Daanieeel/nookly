import ExpoModulesCore
import QuickLookThumbnailing
import UIKit

/// Shows a stored file inside the app: a PDF in PDFKit (pages, search, zoom), anything else
/// in Quick Look. Reads the file only; it never writes to or moves the original.
public class NooklyFileViewerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NooklyFileViewer")

    /// A picture of the file's first page or frame, written to the caches folder. Nil when the
    /// system has no thumbnail for it.
    AsyncFunction("thumbnail") { (uri: String, name: String, size: Double, promise: Promise) in
      guard let url = NooklyFileView.viewableURL(uri: uri, name: name) else {
        promise.resolve(nil)
        return
      }
      let request = QLThumbnailGenerator.Request(
        fileAt: url,
        size: CGSize(width: size, height: size),
        scale: UIScreen.main.scale,
        representationTypes: .thumbnail
      )
      QLThumbnailGenerator.shared.generateBestRepresentation(for: request) { thumbnail, _ in
        guard let data = thumbnail?.uiImage.pngData() else {
          promise.resolve(nil)
          return
        }
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
          .appendingPathComponent("file-thumbnails", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let key = "\(url.path.hashValue)-\(Int(size))-\(Int(UIScreen.main.scale)).png"
        let out = folder.appendingPathComponent(key)
        do {
          try data.write(to: out, options: .atomic)
          promise.resolve(out.absoluteString)
        } catch {
          promise.resolve(nil)
        }
      }
    }

    View(NooklyFileView.self) {
      Events("onPageChange", "onSearchResult")

      Prop("source") { (view: NooklyFileView, source: [String: String]) in
        view.load(uri: source["uri"] ?? "", name: source["name"] ?? "")
      }

      Prop("query") { (view: NooklyFileView, query: String?) in
        view.search(query ?? "")
      }

      AsyncFunction("findNext") { (view: NooklyFileView, backwards: Bool) in
        view.findNext(backwards: backwards)
      }.runOnQueue(.main)

      AsyncFunction("goToPage") { (view: NooklyFileView, page: Int) in
        view.goToPage(page)
      }.runOnQueue(.main)
    }
  }
}
