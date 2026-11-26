import {
  ApiClient,
  ApiRequestError,
  ProviderNoAccountError,
  TERMS_VERSION,
  TwoFactorRequiredError,
} from "@nookly/shared/api";
import { act, screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { settings } from "#/lib/settings/settings.ts";
import { AccountDialog } from "./AccountDialog.tsx";
import { useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

const ADA = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "ada",
  email: null,
  emailVerified: false,
  createdAt: "",
  termsVersion: null,
  needsUsername: false,
};

const TICK = { name: /at least 18 and agree to the Terms of Service/ };

/// The second step of creating an account on Nookly's server: the beta key, the terms.
async function agree(user: UserEvent, key = "the-key") {
  await user.click(await screen.findByRole("checkbox", TICK));
  await user.type(screen.getByLabelText(/^Beta key/), key);
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

/// A provider's button, once the server has said it has the provider.
async function offered(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

function open(mode: "signIn" | "signUp" = "signIn") {
  const rendered = renderWithProviders(<AccountDialog />);
  act(() => useAccountDialog.getState().show(mode));
  return rendered;
}

/// A server with Google, GitHub and Notion, like Nookly's own: Apple is still to come.
beforeEach(() => {
  vi.spyOn(syncRuntime, "providersOf").mockResolvedValue(["google", "github", "notion"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => useAccountDialog.getState().close());
  settings.set("sync.serverUrl", "");
});

describe("the account dialog", () => {
  it("asks for a username or email and a password, and has no accessibility violations", async () => {
    open();
    expect(screen.getByRole("dialog", { name: "Sign in to Nookly" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Username or email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("shows what is missing instead of doing nothing", async () => {
    const { user } = open();
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Enter your username or email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
  });

  it("signs in on the server it shows, then closes", async () => {
    const signIn = vi.spyOn(syncRuntime, "signIn").mockResolvedValue(ADA);
    const { user } = open();
    expect(screen.getByText("https://sync.nookly.work")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Username or email/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(signIn).toHaveBeenCalledWith("https://sync.nookly.work", "ada", "a long password", {});
    expect(settings.get("sync.serverUrl")).toBe("https://sync.nookly.work");
    expect(useAccountDialog.getState().open).toBe(false);
  });

  it("asks what happens to what is on this device in a second step, then signs in", async () => {
    vi.spyOn(syncRuntime, "localDataCount").mockResolvedValue(120);
    const signIn = vi.spyOn(syncRuntime, "signIn").mockResolvedValue(ADA);
    const { user } = open();
    await user.type(screen.getByLabelText(/Username or email/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    // The form does not carry the question: it is asked once a sign in is asked for.
    expect(screen.queryByText(/This device already holds/)).not.toBeInTheDocument();
    await waitFor(() => expect(syncRuntime.localDataCount).toHaveBeenCalled());
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText(/This device already holds 120 items/)).toBeInTheDocument();
    // Nothing joins an account, and nothing is cleared, without an answer.
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await expectNoA11yViolations();
    await user.click(screen.getByRole("button", { name: "Keep out of the account" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(signIn).toHaveBeenCalledWith("https://sync.nookly.work", "ada", "a long password", {
      localData: "setAside",
    });
  });

  it("goes back from the question to the form with nothing sent", async () => {
    vi.spyOn(syncRuntime, "localDataCount").mockResolvedValue(120);
    const signIn = vi.spyOn(syncRuntime, "signIn").mockResolvedValue(ADA);
    const { user } = open();
    await user.type(screen.getByLabelText(/Username or email/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await waitFor(() => expect(syncRuntime.localDataCount).toHaveBeenCalled());
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText(/This device already holds 120 items/);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText(/Username or email/)).toHaveValue("ada");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the reason when signing in fails", async () => {
    vi.spyOn(syncRuntime, "signIn").mockRejectedValue(
      new ApiRequestError(
        401,
        "invalid_username_or_password",
        "The username or the password is wrong.",
      ),
    );
    const { user } = open();
    await user.type(screen.getByLabelText(/Username or email/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "not it at all");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("The username or the password is wrong.")).toBeInTheDocument();
    expect(useAccountDialog.getState().open).toBe(true);
  });

  it("creates an account with a username and an email, and the beta key in the next step", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.getByRole("dialog", { name: "Create your account" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    expect(screen.queryByLabelText(/^Beta key/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await agree(user, " the-key ");
    expect(signUp).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      {
        username: "ada",
        email: "ada@example.com",
        password: "a long password",
        betaKey: "the-key",
        termsVersion: TERMS_VERSION,
      },
      {},
    );
  });

  it("will not create an account without an email address, which is how a code reaches you", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.queryByText(/Optional/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Enter your email address")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("asks for the password twice, with placeholders, and refuses two that differ", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    // The repeat field has no label of its own, only a placeholder and a name for screen readers.
    expect(screen.queryByText("Repeat password")).not.toBeInTheDocument();
    for (const placeholder of ["ada", "Password", "Repeat password"]) {
      expect(screen.getByPlaceholderText(placeholder)).toBeVisible();
    }
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "another long one");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("The passwords don't match")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows how strong the password is under the repeat field, and still allows a weak one", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    const weak = "password123";
    await user.type(screen.getByLabelText(/^Password/), weak);
    expect(screen.getByRole("meter")).toHaveAccessibleName(/password strength/i);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText("Repeat password"), weak);
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await agree(user);
    expect(signUp).toHaveBeenCalled();
  });

  it("asks for the terms in a second step, and will not create an account without them", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    // The form itself has no box to tick.
    expect(screen.queryByRole("checkbox", TICK)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByRole("checkbox", TICK)).not.toBeChecked();
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    // Beside the box and in the legal links at the foot.
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })).toHaveLength(2);
    await expectNoA11yViolations();
    await user.click(screen.getByRole("checkbox", TICK));
    // The terms alone are not enough: the beta key is asked for here too.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Beta key/), "the-key");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it("goes back from the terms to the form with what was typed", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByRole("checkbox", TICK);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText(/^Username/)).toHaveValue("ada");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("reverts a changed server to the one the dialog opened with, even when it was emptied", async () => {
    const { user } = open("signUp");
    expect(screen.queryByRole("button", { name: "Revert Server" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change Server" }));
    // Nothing to revert yet: it is still the server it opened with.
    expect(screen.queryByRole("button", { name: "Revert Server" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Server/));
    expect(await screen.findByText("Enter the server's address")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revert Server" }));
    // Back to the address shown at first, and the field folds away again.
    expect(screen.getByText("https://sync.nookly.work")).toBeInTheDocument();
    expect(screen.queryByText("Enter the server's address")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Server" })).toBeInTheDocument();
  });

  it("has no terms to agree to on a server of your own", async () => {
    const { user } = open("signUp");
    await user.click(screen.getByRole("button", { name: "Change Server" }));
    const server = screen.getByLabelText(/^Server/);
    await user.clear(server);
    await user.type(server, "https://sync.example.com");
    expect(screen.queryByRole("checkbox", TICK)).not.toBeInTheDocument();
  });

  it("links the legal pages at the foot, signing in or creating an account", () => {
    open();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeInTheDocument();
  });

  it("keeps the beta key hidden while it is typed, in the second step", async () => {
    const { user } = open("signUp");
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByLabelText(/^Beta key/)).toHaveAttribute("type", "password");
  });

  it("asks for the beta key in the next step, not as a mistake on the form", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByLabelText(/^Beta key/)).toBeVisible();
    expect(screen.queryByText("Enter the beta key to create an account.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", TICK));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("does not insist on a beta key on a server of your own", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    await user.click(screen.getByRole("button", { name: "Change Server" }));
    const server = screen.getByLabelText(/^Server/);
    await user.clear(server);
    await user.type(server, "https://sync.example.com");
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(signUp).toHaveBeenCalledWith(
      "https://sync.example.com",
      {
        username: "ada",
        email: "ada@example.com",
        password: "a long password",
        betaKey: undefined,
        termsVersion: undefined,
      },
      {},
    );
  });

  it("shows the server's answer to a wrong beta key", async () => {
    vi.spyOn(syncRuntime, "signUp").mockRejectedValue(
      new ApiRequestError(403, "FORBIDDEN", "That beta key isn't right."),
    );
    const { user } = open("signUp");
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await agree(user, "nope");
    expect(await screen.findByText("That beta key isn't right.")).toBeInTheDocument();
    expect(useAccountDialog.getState().open).toBe(true);
  });

  it("checks the username and the password length before creating anything", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp");
    const { user } = open("signUp");
    await user.type(screen.getByLabelText(/^Username/), "ad a");
    await user.type(screen.getByLabelText(/^Password/), "short");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(
      await screen.findByText("Use only letters, digits, dots and underscores"),
    ).toBeInTheDocument();
    expect(screen.getByText("Use at least 10 characters")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
    await expectNoA11yViolations();
  });

  it("sends a reset link to an email address", async () => {
    const forgot = vi.spyOn(ApiClient.prototype, "forgotPassword").mockResolvedValue();
    const { user } = open();
    await user.click(screen.getByRole("button", { name: "Forgot Password" }));
    expect(screen.getByRole("dialog", { name: "Reset your password" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send Link" }));
    expect(forgot).toHaveBeenCalledWith("ada@example.com");
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });

  it("can sign in to another server", async () => {
    const signIn = vi.spyOn(syncRuntime, "signIn").mockResolvedValue(ADA);
    const { user } = open();
    await user.click(screen.getByRole("button", { name: "Change Server" }));
    const server = screen.getByLabelText(/^Server/);
    await user.clear(server);
    await user.type(server, "https://sync.example.com/");
    await user.type(screen.getByLabelText(/Username or email/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(signIn).toHaveBeenCalledWith("https://sync.example.com", "ada", "a long password", {});
  });

  it("offers the providers the server has, and Apple as coming soon", async () => {
    const { user } = open();
    for (const provider of ["Google", "GitHub", "Notion"]) {
      await offered(`Sign in with ${provider}`);
    }
    const apple = screen.getByRole("button", { name: "Sign in with Apple" });
    expect(apple).toBeDisabled();
    await user.hover(apple.parentElement!);
    expect(await screen.findAllByText("Signing in with Apple is coming soon")).not.toHaveLength(0);
    await expectNoA11yViolations();
  });

  it("offers none of them on a server that has none, like one of your own", async () => {
    vi.spyOn(syncRuntime, "providersOf").mockResolvedValue([]);
    open();
    await screen.findByRole("button", { name: "Sign in with Google" });
    await waitFor(() => expect(syncRuntime.providersOf).toHaveBeenCalled());
    await act(async () => {});
    for (const provider of ["Google", "Apple", "GitHub", "Notion"]) {
      expect(screen.getByRole("button", { name: `Sign in with ${provider}` })).toBeDisabled();
    }
  });

  it("signs in with a provider through the browser, then closes", async () => {
    const signIn = vi.spyOn(syncRuntime, "signInWithProvider").mockResolvedValue(ADA);
    const { user } = open();
    await user.click(await offered("Sign in with GitHub"));
    expect(signIn).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      "github",
      { createAccount: false, betaKey: undefined },
      {},
    );
    expect(useAccountDialog.getState().open).toBe(false);
  });

  it("waits for the browser, and the person can give up", async () => {
    let finish: (user: typeof ADA | null) => void = () => {};
    vi.spyOn(syncRuntime, "signInWithProvider").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const cancel = vi.spyOn(syncRuntime, "cancelProviderSignIn").mockImplementation(() => {
      finish(null);
    });
    const { user } = open();
    await user.click(await offered("Sign in with Google"));
    expect(await screen.findByText("Waiting for Google in your browser")).toBeInTheDocument();
    // One sign in at a time.
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledOnce();
    await offered("Sign in with GitHub");
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
    // Giving up is not an error, and the dialog stays for another try.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(useAccountDialog.getState().open).toBe(true);
  });

  it.each(["signIn", "signUp"] as const)(
    "asks for the second step after a provider, on the %s tab",
    async (mode) => {
      vi.spyOn(syncRuntime, "providersOf").mockResolvedValue(["github"]);
      vi.spyOn(syncRuntime, "signInWithProvider").mockRejectedValue(
        new TwoFactorRequiredError("challenge-1", ["totp"]),
      );
      const complete = vi.spyOn(syncRuntime, "completeTwoFactor").mockResolvedValue(ADA);
      settings.set("sync.serverUrl", "https://sync.example.com");
      const { user } = open(mode);
      await user.click(
        await offered(mode === "signIn" ? "Sign in with GitHub" : "Sign up with GitHub"),
      );
      await user.type(await screen.findByLabelText("Authenticator code"), "123456");
      await waitFor(() =>
        expect(complete).toHaveBeenCalledWith(
          "https://sync.example.com",
          "challenge-1",
          "totp",
          "123456",
          {},
        ),
      );
      await waitFor(() => expect(useAccountDialog.getState().open).toBe(false));
    },
  );

  it("says why a sign in with a provider did not work", async () => {
    vi.spyOn(syncRuntime, "signInWithProvider").mockRejectedValue(
      new Error("There is no Nookly account for this GitHub account yet."),
    );
    const { user } = open();
    await user.click(await offered("Sign in with GitHub"));
    expect(await screen.findByText(/no Nookly account for this GitHub/)).toBeInTheDocument();
    expect(useAccountDialog.getState().open).toBe(true);
  });

  it("asks for the beta key and the terms in a second step before creating an account with a provider", async () => {
    const signIn = vi.spyOn(syncRuntime, "signInWithProvider").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.queryByLabelText(/^Beta key/)).not.toBeInTheDocument();
    await user.click(await offered("Sign up with Notion"));
    expect(await screen.findByLabelText(/^Beta key/)).toBeVisible();
    expect(screen.queryByText("Enter the beta key to create an account.")).not.toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
    await agree(user);
    expect(signIn).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      "notion",
      { createAccount: true, betaKey: "the-key", termsVersion: TERMS_VERSION },
      {},
    );
  });

  it("does not ask for a beta key on a server of your own", async () => {
    vi.spyOn(syncRuntime, "providersOf").mockResolvedValue(["github"]);
    const signIn = vi.spyOn(syncRuntime, "signInWithProvider").mockResolvedValue(ADA);
    const { user } = open("signUp");
    await user.click(screen.getByRole("button", { name: "Change Server" }));
    const server = screen.getByLabelText(/^Server/);
    await user.clear(server);
    await user.type(server, "https://sync.example.com");
    await user.click(await offered("Sign up with GitHub"));
    expect(signIn).toHaveBeenCalledWith(
      "https://sync.example.com",
      "github",
      { createAccount: true, betaKey: undefined },
      {},
    );
  });

  it("asks for the terms in a second step before creating an account with a provider", async () => {
    const signIn = vi.spyOn(syncRuntime, "signInWithProvider").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.queryByText(/By signing up with another account/)).not.toBeInTheDocument();
    await user.click(await offered("Sign up with Google"));
    expect(await screen.findByRole("checkbox", TICK)).not.toBeChecked();
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(signIn).not.toHaveBeenCalled();
  });

  it("offers to create the account when a sign in finds none", async () => {
    const signIn = vi
      .spyOn(syncRuntime, "signInWithProvider")
      .mockRejectedValueOnce(new ProviderNoAccountError("github"))
      .mockResolvedValueOnce(ADA);
    const { user } = open();
    await user.click(await offered("Sign in with GitHub"));
    // Not a dead end: the question is whether to make one.
    expect(await screen.findByText(/no Nookly account for this GitHub account yet/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Beta key/), "the-key");
    await user.click(screen.getByRole("checkbox", TICK));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(signIn).toHaveBeenLastCalledWith(
      "https://sync.nookly.work",
      "github",
      { createAccount: true, betaKey: "the-key", termsVersion: TERMS_VERSION },
      {},
    );
    expect(signIn).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(useAccountDialog.getState().open).toBe(false));
  });

  it("keeps the buttons on when the device holds data, and asks in a second step", async () => {
    vi.spyOn(syncRuntime, "localDataCount").mockResolvedValue(3);
    const signIn = vi.spyOn(syncRuntime, "signInWithProvider").mockResolvedValue(ADA);
    const { user } = open();
    await waitFor(() => expect(syncRuntime.providersOf).toHaveBeenCalled());
    await waitFor(() => expect(syncRuntime.localDataCount).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));
    await screen.findByText(/This device already holds 3 items/);
    expect(signIn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add to the account" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(signIn).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      "google",
      { createAccount: false, betaKey: undefined },
      { localData: "add" },
    );
  });

  it("shows a placeholder in every field", async () => {
    const { user } = open();
    expect(screen.getByLabelText(/Username or email/)).toHaveAttribute(
      "placeholder",
      "Username or email",
    );
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("placeholder", "Password");
    await user.click(screen.getByRole("tab", { name: "I'm new here" }));
    expect(screen.getByLabelText(/^Username/)).toHaveAttribute("placeholder", "ada");
  });

  it("scrolls inside the window instead of running off it, in every mode", async () => {
    const { user } = open();
    const fits = () => screen.getByRole("dialog");
    expect(fits()).toHaveClass("overflow-y-auto", "max-h-[calc(100dvh-2rem)]");
    await user.click(screen.getByRole("tab", { name: "I'm new here" }));
    expect(fits()).toHaveClass("overflow-y-auto", "max-h-[calc(100dvh-2rem)]");
  });

  it("shows the other accounts as logos on the usual secondary button, without names", () => {
    open("signUp");
    for (const provider of ["Google", "Apple", "GitHub", "Notion"]) {
      const button = screen.getByRole("button", { name: `Sign up with ${provider}` });
      expect(button).toHaveTextContent("");
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button).toHaveClass("bg-raised", "border-input");
      expect(button).not.toHaveAttribute("data-slot", "brand-button");
    }
    // Google's mark keeps its own colours; the others are single colour marks that follow the text.
    const google = screen.getByRole("button", { name: "Sign up with Google" });
    expect(google.querySelectorAll("path[fill^='#']")).toHaveLength(4);
  });

  it("draws GitHub as its round mark, in the text colour", () => {
    open("signUp");
    const mark = screen
      .getByRole("button", { name: "Sign up with GitHub" })
      .querySelector("svg[data-mark='github']");
    expect(mark).not.toBeNull();
    expect(mark).toHaveClass("fill-current");
  });

  it("draws Notion as a white page with black lines, on either theme", () => {
    open("signUp");
    const mark = screen
      .getByRole("button", { name: "Sign up with Notion" })
      .querySelector("svg[data-mark='notion']");
    expect(mark?.querySelector("rect")).toHaveAttribute("fill", "#FFFFFF");
    expect(mark?.querySelector("path")).toHaveAttribute("fill", "#000000");
  });

  it("offers the other accounts in one row", () => {
    open("signUp");
    const row = screen.getByRole("button", { name: "Sign up with Google" }).closest(".grid");
    expect(row).toHaveClass("grid-cols-4");
  });

  it("invites someone new to create an account, free during the beta", async () => {
    const { user } = open();
    await user.click(screen.getByRole("tab", { name: "I'm new here" }));
    expect(screen.getByRole("dialog", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByText(/free during the closed beta/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
  });
});

describe("the second step of signing in", () => {
  async function toSecondStep(methods: ("totp" | "email" | "backup")[]) {
    vi.spyOn(syncRuntime, "signIn").mockRejectedValue(
      new TwoFactorRequiredError("challenge-1", methods),
    );
    const rendered = open();
    await rendered.user.type(screen.getByLabelText(/Username or email/), "ada");
    await rendered.user.type(screen.getByLabelText(/^Password/), "a long password");
    await rendered.user.click(screen.getByRole("button", { name: "Sign In" }));
    return rendered;
  }

  it("asks for the code of the authenticator app, and signs in with it", async () => {
    const complete = vi.spyOn(syncRuntime, "completeTwoFactor").mockResolvedValue(ADA);
    const { user } = await toSecondStep(["totp", "email", "backup"]);
    expect(await screen.findByLabelText(/^Authenticator code/)).toBeInTheDocument();
    await expectNoA11yViolations();
    // Six boxes; the last digit signs in, with no button to find.
    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Authenticator code/), "123 456");
    await waitFor(() => expect(complete).toHaveBeenCalled());
    expect(complete).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      "challenge-1",
      "totp",
      "123456",
      {},
    );
    expect(useAccountDialog.getState().open).toBe(false);
  });

  it("keeps the step open with the reason when the code is wrong", async () => {
    vi.spyOn(syncRuntime, "completeTwoFactor").mockRejectedValue(
      new ApiRequestError(401, "invalid_code", "That code isn't right."),
    );
    const { user } = await toSecondStep(["totp"]);
    await user.type(await screen.findByLabelText(/^Authenticator code/), "000000");
    const slots = () => [...document.querySelectorAll('[data-slot="input-otp-slot"]')];
    // The boxes turn red instead of a sentence, and calm again once another digit is typed.
    await waitFor(() =>
      expect(slots().every((slot) => slot.getAttribute("aria-invalid") === "true")).toBe(true),
    );
    expect(screen.queryByText("That code isn't right.")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Authenticator code/), "1");
    expect(slots().some((slot) => slot.hasAttribute("aria-invalid"))).toBe(false);
    expect(useAccountDialog.getState().open).toBe(true);
  });

  it("emails a code when that is the choice, and takes a recovery code too", async () => {
    const send = vi.spyOn(syncRuntime, "sendTwoFactorEmail").mockResolvedValue();
    const complete = vi.spyOn(syncRuntime, "completeTwoFactor").mockResolvedValue(ADA);
    const { user } = await toSecondStep(["email", "backup"]);
    // Only email and a recovery code: the email goes at once, with nothing to choose first.
    expect(await screen.findByLabelText(/^Emailed code/)).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith("https://sync.nookly.work", "challenge-1");
    expect(screen.getByText(/We emailed a code/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use a recovery code" }));
    // A recovery code is letters and a dash: one plain field, not boxes.
    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(0);
    await user.type(screen.getByLabelText(/^Recovery code/), "abcde-fghij");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(complete).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      "challenge-1",
      "backup",
      "abcde-fghij",
      {},
    );
  });

  it("goes back to the password", async () => {
    const { user } = await toSecondStep(["totp"]);
    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
  });
});
