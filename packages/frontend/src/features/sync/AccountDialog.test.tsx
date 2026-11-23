import { ApiClient, ApiRequestError, TERMS_VERSION } from "@nookly/shared/api";
import { act, screen, waitFor } from "@testing-library/react";
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

  it("asks what happens to what is on this device, and signs in with the answer", async () => {
    vi.spyOn(syncRuntime, "localDataCount").mockResolvedValue(120);
    const signIn = vi.spyOn(syncRuntime, "signIn").mockResolvedValue(ADA);
    const { user } = open();
    expect(await screen.findByText(/This device already holds 120 items/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Username or email/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    // Nothing joins an account, and nothing is cleared, without an answer.
    expect(screen.getByRole("button", { name: "Sign In" })).toBeDisabled();
    await expectNoA11yViolations();
    await user.click(screen.getByRole("button", { name: "Keep out of the account" }));
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(signIn).toHaveBeenCalledWith("https://sync.nookly.work", "ada", "a long password", {
      localData: "setAside",
    });
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

  it("creates an account with a username and the beta key, the email being optional", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.getByRole("dialog", { name: "Create your account" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Beta key/), " the-key ");
    await user.click(screen.getByRole("checkbox", TICK));
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(signUp).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      {
        username: "ada",
        email: undefined,
        password: "a long password",
        betaKey: "the-key",
        termsVersion: TERMS_VERSION,
      },
      {},
    );
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
    await user.type(screen.getByLabelText(/^Beta key/), "the-key");
    await user.click(screen.getByRole("checkbox", TICK));
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
    await user.type(screen.getByLabelText(/^Beta key/), "the-key");
    await user.click(screen.getByRole("checkbox", TICK));
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(signUp).toHaveBeenCalled();
  });

  it("will not create an account until the terms are agreed to", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.getByRole("checkbox", TICK)).not.toBeChecked();
    // Beside the box, in the note under the other accounts, and in the legal links at the foot.
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })).toHaveLength(3);
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.type(screen.getByLabelText(/^Beta key/), "the-key");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Agree to the terms to create an account")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", TICK));
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(signUp).toHaveBeenCalledTimes(1);
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

  it("keeps the beta key hidden while it is typed", () => {
    open("signUp");
    expect(screen.getByLabelText(/^Beta key/)).toHaveAttribute("type", "password");
  });

  it("asks for the beta key before creating an account on Nookly's server", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.type(screen.getByLabelText("Repeat password"), "a long password");
    await user.click(screen.getByRole("checkbox", TICK));
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Enter the beta key to create an account.")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(signUp).toHaveBeenCalledWith(
      "https://sync.example.com",
      {
        username: "ada",
        email: undefined,
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
    await user.type(screen.getByLabelText(/^Beta key/), "nope");
    await user.click(screen.getByRole("checkbox", TICK));
    await user.click(screen.getByRole("button", { name: "Create Account" }));
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

  it("says why a sign in with a provider did not work", async () => {
    vi.spyOn(syncRuntime, "signInWithProvider").mockRejectedValue(
      new Error("There is no Nookly account for this GitHub account yet."),
    );
    const { user } = open();
    await user.click(await offered("Sign in with GitHub"));
    expect(await screen.findByText(/no Nookly account for this GitHub/)).toBeInTheDocument();
    expect(useAccountDialog.getState().open).toBe(true);
  });

  it("creates an account with a provider only with the beta key typed first", async () => {
    const signIn = vi.spyOn(syncRuntime, "signInWithProvider").mockResolvedValue(ADA);
    const { user } = open("signUp");
    await user.click(await offered("Sign up with Notion"));
    expect(await screen.findByText("Enter the beta key to create an account.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Beta key/), "the-key");
    await user.click(screen.getByRole("button", { name: "Sign up with Notion" }));
    expect(signIn).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      "notion",
      { createAccount: true, betaKey: "the-key" },
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

  it("points at the terms next to the buttons that create an account", async () => {
    open("signUp");
    await offered("Sign up with Google");
    expect(screen.getByText(/By signing up with another account you agree/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Terms of Service" }).length).toBeGreaterThan(1);
  });

  it("holds the buttons back while the question about what is on this device is open", async () => {
    vi.spyOn(syncRuntime, "localDataCount").mockResolvedValue(3);
    const signIn = vi.spyOn(syncRuntime, "signInWithProvider").mockResolvedValue(ADA);
    const { user } = open();
    await screen.findByText(/This device already holds 3 items/);
    // The server has answered, and still nothing can be sent before the question is.
    await waitFor(() => expect(syncRuntime.providersOf).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add to the account" }));
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(signIn).toHaveBeenCalledWith(
      "https://sync.nookly.work",
      "google",
      { createAccount: false, betaKey: undefined },
      { localData: "add" },
    );
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
