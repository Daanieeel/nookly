import { ApiClient, ApiRequestError } from "@nookly/shared/api";
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
};

function open(mode: "signIn" | "signUp" = "signIn") {
  const rendered = renderWithProviders(<AccountDialog />);
  act(() => useAccountDialog.getState().show(mode));
  return rendered;
}

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
    expect(screen.getByText("http://localhost:3000")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Username or email/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(signIn).toHaveBeenCalledWith("http://localhost:3000", "ada", "a long password");
    expect(settings.get("sync.serverUrl")).toBe("http://localhost:3000");
    expect(useAccountDialog.getState().open).toBe(false);
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

  it("creates an account with a username, the email being optional", async () => {
    const signUp = vi.spyOn(syncRuntime, "signUp").mockResolvedValue(ADA);
    const { user } = open("signUp");
    expect(screen.getByRole("dialog", { name: "Create your account" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Username/), "ada");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(signUp).toHaveBeenCalledWith("http://localhost:3000", {
      username: "ada",
      email: undefined,
      password: "a long password",
    });
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
    expect(signIn).toHaveBeenCalledWith("https://sync.example.com", "ada", "a long password");
  });
});
