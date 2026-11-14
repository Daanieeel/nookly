/// The part of the web editor's handle that runs a command.
interface Runner {
  run?: (command: string) => void;
}

/// Runs a toolbar command (`done`, `undo`, a block type) on the web editor. Its methods
/// arrive once its page has loaded; until then (a page left at once) there is nothing to
/// run, which must not throw.
export function runOn(handle: Runner | null, command: string) {
  handle?.run?.(command);
}
