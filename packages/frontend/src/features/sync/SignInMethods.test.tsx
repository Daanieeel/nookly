import { ApiClient, ApiRequestError, type SignInSummary } from "@nookly/shared/api";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { recheck } from "./recheck-gate.ts";
import { SignInMethods } from "./SignInMethods.tsx";
import { syncRuntime } from "./sync-instance.ts";

const ADA = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "ada",
  email: "ada@example.com",
  emailVerified: true,
  createdAt: "",
  termsVersion: null,
  needsUsername: false,
};

const method = (provider: string, extra: Partial<SignInSummary["methods"][number]> = {}) => ({
  provider,
  email: `${provider}@example.com`,
  emailVerified: true,
  primary: false,
  canBePrimary: true,
  ...extra,
});

const WITH_PASSWORD: SignInSummary = {
  methods: [method("credential", { primary: true, canBePrimary: false }), method("github")],
  current: "credential",
  fresh: true,
  secondStep: [],
  offered: ["google", "github", "notion"],
};

const ONLY_GITHUB: SignInSummary = {
  ...WITH_PASSWORD,
  methods: [method("github", { primary: true, canBePrimary: false })],
  current: "github",
};

let api: ApiClient;
let summary: SignInSummary;
const changed = async () => ({ ...summary, signedOut: false });

beforeEach(() => {
  summary = WITH_PASSWORD;
  api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  vi.spyOn(api, "signInMethods").mockImplementation(async () => summary);
  vi.spyOn(syncRuntime, "account").mockReturnValue(api);
  vi.spyOn(syncRuntime, "twoFactorChanged").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => syncRuntime.store.setState({ user: null }));
});

function open() {
  const rendered = renderWithProviders(<SignInMethods />);
  act(() => syncRuntime.store.setState({ user: ADA }));
  return rendered;
}

const row = async (name: string) => {
  const list = await screen.findByRole("list", { name: "Sign in methods" });
  const found = within(list)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name, { exact: true }));
  if (!found) throw new Error(`no row for ${name}`);
  return found;
};

async function choose(user: ReturnType<typeof open>["user"], name: string, item: string) {
  await user.click(within(await row(name)).getByRole("button", { name: "Sign In Options" }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("the sign in methods", () => {
  it("lists what is connected, marks the primary and offers the rest", async () => {
    open();
    const own = await row("Nookly Signin");
    expect(within(own).getByText("credential@example.com")).toBeVisible();
    expect(within(own).getByText("Primary")).toBeVisible();
    expect(within(await row("GitHub")).queryByText("Primary")).not.toBeInTheDocument();
    expect(within(await row("Google")).getByRole("button", { name: "Connect" })).toBeVisible();
    expect(within(await row("Notion")).getByRole("button", { name: "Connect" })).toBeVisible();
    await expectNoA11yViolations();
  });

  it("says so when nobody is signed in", () => {
    renderWithProviders(<SignInMethods />);
    expect(screen.getByText("Sign in to Nookly to see how you sign in.")).toBeInTheDocument();
  });

  it("offers the primary nothing that would remove it", async () => {
    const { user } = open();
    await user.click(
      within(await row("Nookly Signin")).getByRole("button", { name: "Sign In Options" }),
    );
    const items = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(items).toEqual(["Change Email", "Change Password"]);
    await expectNoA11yViolations();
  });

  it("makes another one primary", async () => {
    const primary = vi.spyOn(api, "setPrimary").mockImplementation(changed);
    const { user } = open();
    await choose(user, "GitHub", "Make Primary");
    await waitFor(() => expect(primary).toHaveBeenCalledWith("github"));
    expect(syncRuntime.twoFactorChanged).toHaveBeenCalled();
  });

  it("disconnects one after saying what that does", async () => {
    const drop = vi.spyOn(syncRuntime, "disconnectProvider").mockImplementation(changed);
    const { user } = open();
    await choose(user, "GitHub", "Disconnect");
    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect GitHub?" });
    expect(dialog).toHaveTextContent("Devices that signed in with it are signed out.");
    expect(dialog).not.toHaveTextContent("This computer");
    await expectNoA11yViolations();
    expect(drop).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(drop).toHaveBeenCalledWith("github"));
  });

  it("warns that this computer signs out too, when it signed in that way", async () => {
    summary = { ...WITH_PASSWORD, current: "github" };
    const { user } = open();
    await choose(user, "GitHub", "Disconnect");
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "This computer signs out too. Your data stays on it.",
    );
  });

  it("connects a provider through the browser", async () => {
    const link = vi.spyOn(syncRuntime, "linkProvider").mockImplementation(changed);
    const { user } = open();
    await user.click(within(await row("Notion")).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(link).toHaveBeenCalledWith("notion"));
  });

  it("adds Nookly Signin with an email confirmed by a code, and a password", async () => {
    summary = ONLY_GITHUB;
    const send = vi.spyOn(api, "sendEmailCode").mockResolvedValue();
    const add = vi.spyOn(api, "addPassword").mockImplementation(changed);
    const { user } = open();
    await user.click(within(await row("Nookly Signin")).getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "Add Nookly Signin" });
    await user.type(within(dialog).getByLabelText(/^Email/), "own@example.com");
    await expectNoA11yViolations();
    await user.click(within(dialog).getByRole("button", { name: "Send Code" }));
    expect(send).toHaveBeenCalledWith("credential", "own@example.com");
    await user.type(await within(dialog).findByLabelText("Code from the email"), "123456");
    await user.type(within(dialog).getByLabelText("New password"), "a long password");
    await user.type(within(dialog).getByLabelText("Repeat new password"), "a long password");
    await expectNoA11yViolations();
    await user.click(within(dialog).getByRole("button", { name: "Add Nookly Signin" }));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith("own@example.com", "123456", "a long password"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("changes an email with the code sent to the new address", async () => {
    const send = vi.spyOn(api, "sendEmailCode").mockResolvedValue();
    const change = vi.spyOn(api, "changeEmail").mockImplementation(changed);
    const { user } = open();
    await choose(user, "Nookly Signin", "Change Email");
    const dialog = await screen.findByRole("dialog", { name: "Change Email" });
    await user.type(within(dialog).getByLabelText(/^Email/), "new@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send Code" }));
    expect(send).toHaveBeenCalledWith("credential", "new@example.com");
    await user.type(await within(dialog).findByLabelText("Code from the email"), "654321");
    await user.click(within(dialog).getByRole("button", { name: "Change Email" }));
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith("credential", "new@example.com", "654321"),
    );
  });

  it("changes the password, typed twice and rated", async () => {
    const set = vi.spyOn(api, "setPassword").mockImplementation(changed);
    const { user } = open();
    await choose(user, "Nookly Signin", "Change Password");
    const dialog = await screen.findByRole("dialog", { name: "Change Password" });
    expect(within(dialog).queryByRole("meter")).toBeNull();
    await user.type(within(dialog).getByLabelText("New password"), "password1234");
    const again = within(dialog).getByLabelText("Repeat new password");
    const meter = within(dialog).getByRole("meter", { name: "Password strength" });
    expect(again.compareDocumentPosition(meter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.type(again, "password12345");
    await user.click(within(dialog).getByRole("button", { name: "Change Password" }));
    expect(await within(dialog).findByText("The passwords don't match")).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
    await user.clear(again);
    await user.type(again, "password1234");
    await expectNoA11yViolations();
    await user.click(within(dialog).getByRole("button", { name: "Change Password" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("password1234"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reports no failure when the question about who you are is closed", async () => {
    vi.spyOn(api, "setPassword").mockRejectedValue(
      new ApiRequestError(403, "recheck_required", "Confirm it's you."),
    );
    const { user } = open();
    await choose(user, "Nookly Signin", "Change Password");
    const dialog = await screen.findByRole("dialog", { name: "Change Password" });
    await user.type(within(dialog).getByLabelText("New password"), "a long password");
    await user.type(within(dialog).getByLabelText("Repeat new password"), "a long password");
    await user.click(within(dialog).getByRole("button", { name: "Change Password" }));
    await waitFor(() => expect(recheck.store.getState().asking).toBe(true));
    act(() => recheck.finish(false));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Change Password" })).toBeEnabled(),
    );
    expect(within(dialog).queryByText("Couldn't change it")).not.toBeInTheDocument();
  });

  it("only offers a change of email to the primary and to Nookly Signin", async () => {
    const { user } = open();
    await user.click(within(await row("GitHub")).getByRole("button", { name: "Sign In Options" }));
    const items = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(items).toEqual(["Make Primary", "Disconnect"]);
  });
});
