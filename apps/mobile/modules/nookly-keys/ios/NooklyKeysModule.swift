import ExpoModulesCore
import GameController
import ObjectiveC
import UIKit

/// One shortcut as JavaScript describes it: `input` is the key ("k", "\t", "UIKeyInputEscape"),
/// `modifiers` any of "command", "shift", "option", "control".
struct Shortcut: Record {
  @Field var id: String
  @Field var input: String
  @Field var modifiers: [String]
  @Field var title: String
}

/// One of the app's menus in the iPadOS menu bar: `title` ("File", "Go") and the ids of
/// the shortcuts it lists, in order.
struct ShortcutMenu: Record {
  @Field var title: String
  @Field var ids: [String]
}

private var commands: [UIKeyCommand] = []
private var menus: [ShortcutMenu] = []
private var menusInstalled = false

/// The system's own menus a menu of ours joins, by title; others go before Window.
private let standardMenus: [String: UIMenu.Identifier] = [
  "File": .file, "Edit": .edit, "View": .view, "Window": .window,
]

private func copyCommand(_ command: UIKeyCommand) -> UIKeyCommand {
  UIKeyCommand(
    title: command.title,
    image: nil,
    action: command.action ?? action,
    input: command.input ?? "",
    modifierFlags: command.modifierFlags,
    propertyList: command.propertyList
  )
}

/// Teaches the app delegate to fill the iPadOS menu bar (pulled down from the top of the
/// screen, or listed while Command is held) with our menus.
private func installMenus() {
  if menusInstalled { return }
  guard let delegate = UIApplication.shared.delegate else { return }
  menusInstalled = true
  let build: @convention(block) (AnyObject, UIMenuBuilder) -> Void = { _, builder in
    guard builder.system == .main else { return }
    for menu in menus {
      let children: [UIMenuElement] = menu.ids.compactMap { id in
        commands.first { ($0.propertyList as? String) == id }.map(copyCommand)
      }
      if children.isEmpty { continue }
      if let standard = standardMenus[menu.title] {
        builder.insertChild(
          UIMenu(title: "", options: .displayInline, children: children), atEndOfMenu: standard)
      } else {
        builder.insertSibling(
          UIMenu(
            title: menu.title, identifier: UIMenu.Identifier("app.nookly.menu.\(menu.title)"),
            children: children),
          beforeMenu: .window)
      }
    }
  }
  class_addMethod(
    type(of: delegate),
    #selector(UIResponder.buildMenu(with:)),
    imp_implementationWithBlock(build),
    "v@:@"
  )
}
private var installed = false
private weak var receiver: NooklyKeysModule?
private let action = Selector(("nooklyShortcut:"))

private func flags(_ names: [String]) -> UIKeyModifierFlags {
  var result: UIKeyModifierFlags = []
  for name in names {
    switch name {
    case "command": result.insert(.command)
    case "shift": result.insert(.shift)
    case "option": result.insert(.alternate)
    case "control": result.insert(.control)
    default: break
    }
  }
  return result
}

/// Key commands are looked up along the responder chain, which ends at the application,
/// so teaching `UIApplication` about ours makes them work wherever the focus is, text
/// fields included (a text field only answers the keys it knows).
private func install() {
  if installed { return }
  installed = true
  // None while Settings records new keys, so a press reaches the recorder, not a shortcut.
  let list: @convention(block) (AnyObject) -> [UIKeyCommand]? = { _ in
    recorder == nil ? commands : []
  }
  class_replaceMethod(
    UIApplication.self,
    #selector(getter: UIResponder.keyCommands),
    imp_implementationWithBlock(list),
    "@@:"
  )
  let handle: @convention(block) (AnyObject, UIKeyCommand) -> Void = { _, command in
    // The menu bar still answers its keys while Settings records: those are a press too.
    if recorder != nil, let input = command.input {
      receiver?.recorded(input, modifierNames(command.modifierFlags))
      return
    }
    if let id = command.propertyList as? String { receiver?.fire(id) }
  }
  class_addMethod(UIApplication.self, action, imp_implementationWithBlock(handle), "v@:@")
}

/// The keys the system names, by the key's code; a modifier on its own is no press.
private let namedKeys: [UIKeyboardHIDUsage: String] = [
  .keyboardEscape: UIKeyCommand.inputEscape,
  .keyboardUpArrow: UIKeyCommand.inputUpArrow,
  .keyboardDownArrow: UIKeyCommand.inputDownArrow,
  .keyboardLeftArrow: UIKeyCommand.inputLeftArrow,
  .keyboardRightArrow: UIKeyCommand.inputRightArrow,
  .keyboardReturnOrEnter: "\r",
  .keypadEnter: "\r",
  .keyboardTab: "\t",
]
private let modifierKeys: Set<UIKeyboardHIDUsage> = [
  .keyboardLeftGUI, .keyboardRightGUI, .keyboardLeftShift, .keyboardRightShift,
  .keyboardLeftAlt, .keyboardRightAlt, .keyboardLeftControl, .keyboardRightControl,
  .keyboardCapsLock,
]

private func modifierNames(_ flags: UIKeyModifierFlags) -> [String] {
  var names: [String] = []
  if flags.contains(.command) { names.append("command") }
  if flags.contains(.shift) { names.append("shift") }
  if flags.contains(.alternate) { names.append("option") }
  if flags.contains(.control) { names.append("control") }
  return names
}

/// Takes the focus while Settings records new keys and hands each press on, written as
/// `setShortcuts` takes them.
private final class KeyRecorder: UIView {
  override var canBecomeFirstResponder: Bool { true }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    guard let key = presses.first?.key else { return super.pressesBegan(presses, with: event) }
    if modifierKeys.contains(key.keyCode) { return }
    let input = namedKeys[key.keyCode] ?? key.charactersIgnoringModifiers.lowercased()
    if input.isEmpty { return }
    receiver?.recorded(input, modifierNames(key.modifierFlags))
  }

  override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {}
}

private var recorder: KeyRecorder?

private func keyWindow() -> UIWindow? {
  UIApplication.shared.connectedScenes
    .compactMap { ($0 as? UIWindowScene)?.keyWindow }
    .first
}

public class NooklyKeysModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("NooklyKeys")

    Events("onShortcut", "onKeyboard", "onRecorded")

    OnCreate {
      receiver = self
      install()
      let center = NotificationCenter.default
      self.observers = [.GCKeyboardDidConnect, .GCKeyboardDidDisconnect].map { name in
        center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
          self?.sendEvent("onKeyboard", ["connected": GCKeyboard.coalesced != nil])
        }
      }
    }

    OnDestroy {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    /// Whether a hardware keyboard is connected.
    Function("hasKeyboard") { () -> Bool in
      GCKeyboard.coalesced != nil
    }

    /// Hands every key press to "onRecorded" until `stopRecording`.
    Function("startRecording") {
      DispatchQueue.main.async {
        recorder?.removeFromSuperview()
        guard let window = keyWindow() else { return }
        let view = KeyRecorder(frame: .zero)
        window.addSubview(view)
        recorder = view
        view.becomeFirstResponder()
      }
    }

    Function("stopRecording") {
      DispatchQueue.main.async {
        recorder?.resignFirstResponder()
        recorder?.removeFromSuperview()
        recorder = nil
      }
    }

    Function("setShortcuts") { (items: [Shortcut]) in
      commands = items.map { item in
        let command = UIKeyCommand(
          title: item.title,
          image: nil,
          action: action,
          input: item.input,
          modifierFlags: flags(item.modifiers),
          propertyList: item.id
        )
        // A plain arrow is the focused text field's otherwise; ours are only given while a
        // palette keeps a selection, so they win over moving the caret.
        if item.modifiers.isEmpty && item.input.hasPrefix("UIKeyInput") {
          command.wantsPriorityOverSystemBehavior = true
        }
        return command
      }
    }

    /// The menus of the iPadOS menu bar, from the shortcuts given to `setShortcuts`.
    Function("setMenus") { (items: [ShortcutMenu]) in
      menus = items
      DispatchQueue.main.async {
        installMenus()
        UIMenuSystem.main.setNeedsRebuild()
      }
    }

    /// For checks that cannot press a key.
    Function("emit") { (id: String) in
      self.fire(id)
    }
  }

  func fire(_ id: String) {
    sendEvent("onShortcut", ["id": id])
  }

  func recorded(_ input: String, _ modifiers: [String]) {
    sendEvent("onRecorded", ["input": input, "modifiers": modifiers])
  }

}
