/// What the account window says at its top, in each of its modes: the desktop's dialog and
/// the phone's pages read the same words.
type AccountMode = "signIn" | "signUp" | "reset";

export const ACCOUNT_COPY = {
  signIn: {
    title: "Sign in to Nookly",
    description: "Pick up where you left off, the same on every device.",
  },
  signUp: {
    title: "Create your account",
    description: "One account for your computer, phone and tablet, free during the closed beta.",
  },
  reset: {
    title: "Reset your password",
    description: "We'll email a link to choose a new one, if the address belongs to an account.",
  },
} satisfies Record<AccountMode, { title: string; description: string }>;

/// The two ways into an account, as the tabs name them.
export const ACCOUNT_TABS = [
  { value: "signIn", label: "I have an account" },
  { value: "signUp", label: "I'm new here" },
] as const;
