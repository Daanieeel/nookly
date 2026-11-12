import ExpoModulesCore
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

private var commands: [UIKeyCommand] = []
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
  let list: @convention(block) (AnyObject) -> [UIKeyCommand]? = { _ in commands }
  class_replaceMethod(
    UIApplication.self,
    #selector(getter: UIResponder.keyCommands),
    imp_implementationWithBlock(list),
    "@@:"
  )
  let handle: @convention(block) (AnyObject, UIKeyCommand) -> Void = { _, command in
    if let id = command.propertyList as? String { receiver?.fire(id) }
  }
  class_addMethod(UIApplication.self, action, imp_implementationWithBlock(handle), "v@:@")
}

public class NooklyKeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NooklyKeys")

    Events("onShortcut")

    OnCreate {
      receiver = self
      install()
    }

    Function("setShortcuts") { (items: [Shortcut]) in
      commands = items.map { item in
        UIKeyCommand(
          title: item.title,
          image: nil,
          action: action,
          input: item.input,
          modifierFlags: flags(item.modifiers),
          propertyList: item.id
        )
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
}
