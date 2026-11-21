import { useState } from "react";

/// A form the server turned down stays wrong until it is put right: the fields that could have
/// been the reason are drawn invalid, and its button waits, until each of them has been changed.
/// Then the failure is forgotten, so the button asks again.
export function useRejection(
  failure: { error: Error | null; reset: () => void },
  all: readonly string[],
  /// The fields an error points at, when it is plain which (a missing key); else all of them.
  blame: (error: Error) => readonly string[] | null = () => null,
) {
  const names = (failure.error && blame(failure.error)) || all;
  // What was changed since this very failure; a new failure starts with nothing changed.
  const [changed, setChanged] = useState<{ error: Error | null; names: readonly string[] }>({
    error: null,
    names: [],
  });
  const touched = changed.error === failure.error ? changed.names : [];
  const rejected = failure.error !== null;
  const waiting = rejected && names.some((name) => !touched.includes(name));
  // Put right: nothing of the failure is left to show.
  if (rejected && !waiting) failure.reset();
  return {
    /// Whether the field is one that was turned down and has not been changed since.
    invalid: (name: string) => rejected && names.includes(name) && !touched.includes(name),
    /// Whether the form's button has to wait.
    waiting,
    /// The field was changed.
    edit: (name: string) =>
      setChanged({
        error: failure.error,
        names: touched.includes(name) ? touched : [...touched, name],
      }),
    /// The server's address was changed, which could be all that was wrong.
    editAll: () => setChanged({ error: failure.error, names }),
  };
}
