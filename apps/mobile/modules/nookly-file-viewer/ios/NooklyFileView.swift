import ExpoModulesCore
import PDFKit
import QuickLook
import UIKit

/// One file, shown as the system shows it: PDFKit for a PDF, Quick Look for the rest.
class NooklyFileView: ExpoView, QLPreviewControllerDataSource {
  let onPageChange = EventDispatcher()
  let onSearchResult = EventDispatcher()

  private var loadedKey = ""
  private var pdfView: PDFView?
  private var preview: QLPreviewController?
  private var previewURL: URL?
  private var matches: [PDFSelection] = []
  private var matchIndex = 0
  private var query = ""

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
  }

  /// A `file://` URL Quick Look and PDFKit can read. A stored file whose path lacks the
  /// original's extension is linked under its own name in the caches folder, so the system
  /// can tell what it is; the original stays untouched.
  static func viewableURL(uri: String, name: String) -> URL? {
    guard let url = URL(string: uri), url.isFileURL,
      FileManager.default.fileExists(atPath: url.path) else { return nil }
    let wanted = (name as NSString).pathExtension.lowercased()
    if wanted.isEmpty || url.pathExtension.lowercased() == wanted { return url }
    let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("file-viewer/\(abs(url.path.hashValue))", isDirectory: true)
    let safe = (name as NSString).lastPathComponent.replacingOccurrences(of: ":", with: "")
    let link = folder.appendingPathComponent(safe.isEmpty ? "file.\(wanted)" : safe)
    if !FileManager.default.fileExists(atPath: link.path) {
      try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      do {
        try FileManager.default.linkItem(at: url, to: link)
      } catch {
        try? FileManager.default.copyItem(at: url, to: link)
      }
    }
    return FileManager.default.fileExists(atPath: link.path) ? link : url
  }

  func load(uri: String, name: String) {
    let key = "\(uri)\n\(name)"
    if key == loadedKey { return }
    loadedKey = key
    tearDown()
    guard let url = Self.viewableURL(uri: uri, name: name) else { return }
    if url.pathExtension.lowercased() == "pdf", let document = PDFDocument(url: url) {
      showPDF(document)
    } else {
      showPreview(url)
    }
  }

  private func tearDown() {
    NotificationCenter.default.removeObserver(self)
    pdfView?.removeFromSuperview()
    pdfView = nil
    if let preview {
      preview.willMove(toParent: nil)
      preview.view.removeFromSuperview()
      preview.removeFromParent()
    }
    preview = nil
    previewURL = nil
    matches = []
  }

  // MARK: PDF

  private func showPDF(_ document: PDFDocument) {
    let view = PDFView(frame: bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.displayMode = .singlePageContinuous
    view.displayDirection = .vertical
    view.autoScales = true
    view.pageShadowsEnabled = true
    view.backgroundColor = .secondarySystemBackground
    view.document = document
    addSubview(view)
    pdfView = view
    NotificationCenter.default.addObserver(
      self, selector: #selector(pageChanged), name: .PDFViewPageChanged, object: view)
    pageChanged()
    if !query.isEmpty { search(query, force: true) }
  }

  @objc private func pageChanged() {
    guard let view = pdfView, let document = view.document else { return }
    let page = view.currentPage.map { document.index(for: $0) + 1 } ?? 1
    onPageChange(["page": page, "count": document.pageCount])
  }

  func goToPage(_ page: Int) {
    guard let view = pdfView, let document = view.document, document.pageCount > 0 else { return }
    let index = min(max(page - 1, 0), document.pageCount - 1)
    if let target = document.page(at: index) { view.go(to: target) }
  }

  func search(_ text: String, force: Bool = false) {
    if text == query && !force { return }
    query = text
    guard let view = pdfView, let document = view.document else { return }
    document.cancelFindString()
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    matches = trimmed.isEmpty
      ? [] : document.findString(trimmed, withOptions: [.caseInsensitive, .diacriticInsensitive])
    matchIndex = 0
    for match in matches { match.color = .systemYellow.withAlphaComponent(0.5) }
    view.highlightedSelections = matches.isEmpty ? nil : matches
    showMatch()
  }

  func findNext(backwards: Bool) {
    guard !matches.isEmpty else { return }
    matchIndex = (matchIndex + (backwards ? matches.count - 1 : 1)) % matches.count
    showMatch()
  }

  private func showMatch() {
    if let view = pdfView, matchIndex < matches.count {
      let match = matches[matchIndex]
      view.setCurrentSelection(match, animate: true)
      view.go(to: match)
    } else {
      pdfView?.clearSelection()
    }
    onSearchResult(["count": matches.count, "index": matches.isEmpty ? 0 : matchIndex + 1])
  }

  // MARK: Quick Look

  private func showPreview(_ url: URL) {
    let controller = QLPreviewController()
    controller.dataSource = self
    previewURL = url
    preview = controller
    attachPreview()
  }

  /// Quick Look is a view controller; it lives as a child of the screen's own.
  private func attachPreview() {
    guard let controller = preview, controller.parent == nil,
      let parent = owningViewController() else { return }
    parent.addChild(controller)
    controller.view.frame = bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(controller.view)
    controller.didMove(toParent: parent)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { attachPreview() }
  }

  override func removeFromSuperview() {
    tearDown()
    super.removeFromSuperview()
  }

  private func owningViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController { return controller }
      responder = next
    }
    return nil
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
    previewURL == nil ? 0 : 1
  }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int)
    -> QLPreviewItem
  {
    (previewURL ?? URL(fileURLWithPath: "/")) as NSURL
  }
}
