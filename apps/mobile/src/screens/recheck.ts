import { createRecheckGate } from "@nookly/shared/api";

/// The one question "Confirm it's you" of the phone: a change that needs it waits here, and
/// `RecheckPrompt` shows it.
export const recheck = createRecheckGate();
