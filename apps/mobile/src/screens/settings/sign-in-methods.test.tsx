import { ApiClient, ApiRequestError, type SignInSummary } from "@nookly/shared/api";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../../test/render.tsx";
import { fakeMoodle } from "../../test/fake-moodle.tsx";
import { recheck } from "../recheck.ts";
import { AccountPage } from "./AccountPage.tsx";
import { CalendarConnectionsPage } from "./CalendarConnectionsPage.tsx";

const ADA = {
  id: "00000000-0000-4000-8000-0000000000bb",
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

function signedIn(summary: SignInSummary = WITH_PASSWORD) {
  const data = testData();
  const api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  jest.spyOn(api, "sessions").mockResolvedValue([]);
  jest.spyOn(api, "security").mockResolvedValue({
    available: true,
    required: false,
    enabled: true,
    email: { enabled: true, possible: true, address: ADA.email, confirmed: true },
    authenticator: { enabled: false },
    backupCodesLeft: 10,
  });
  jest.spyOn(api, "signInMethods").mockResolvedValue(summary);
  jest.spyOn(data.sync, "account").mockReturnValue(api);
  jest.spyOn(data.sync, "twoFactorChanged").mockResolvedValue();
  data.sync.store.setState({ user: ADA, serverUrl: "https://sync.example.com" });
  return { data, api, changed: async () => ({ ...summary, signedOut: false }) };
}

async function open(summary?: SignInSummary) {
  const account = signedIn(summary);
  const screen = await renderScreens({ index: () => <AccountPage /> }, account.data);
  // The rows are there once the account has been read.
  await screen.findByText(/Any of them signs you in/);
  return { ...account, screen };
}

type Screen = Awaited<ReturnType<typeof open>>["screen"];

async function choose(screen: Screen, name: string, item: string) {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${name},`) }));
  await fireEvent.press(await screen.findByRole("menuitem", { name: item }));
}

afterEach(() => {
  act(() => recheck.finish(false));
});

describe("the sign in methods on the Account page", () => {
  it("lists what is connected, marks the primary and offers the rest", async () => {
    const { screen } = await open();
    expect(
      screen.getByRole("button", { name: "Nookly Signin, credential@example.com, Primary" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "GitHub, github@example.com" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Notion" })).toBeTruthy();
  });

  it("is gone from the Connections page", async () => {
    const { data } = signedIn();
    const screen = await renderScreens(
      { index: fakeMoodle().wrap(<CalendarConnectionsPage />) },
      data,
    );
    expect(await screen.findByText(/Show events from your own calendars/)).toBeTruthy();
    expect(screen.queryByText("Signs you in to Nookly")).toBeNull();
  });

  it("offers the primary nothing that would remove it", async () => {
    const { screen } = await open();
    await fireEvent.press(screen.getByRole("button", { name: /^Nookly Signin,/ }));
    const items = (await screen.findAllByRole("menuitem")).map(
      (item) => item.props.accessibilityLabel,
    );
    expect(items).toEqual(["Change Email", "Change Password"]);
  });

  it("makes another one primary", async () => {
    const { screen, api, changed, data } = await open();
    const primary = jest.spyOn(api, "setPrimary").mockImplementation(changed);
    await choose(screen, "GitHub", "Make Primary");
    await waitFor(() => expect(primary).toHaveBeenCalledWith("github"));
    await waitFor(() => expect(data.sync.twoFactorChanged).toHaveBeenCalled());
  });

  it("disconnects one after saying what that does", async () => {
    const { screen, data, changed } = await open();
    const drop = jest.spyOn(data.sync, "disconnectProvider").mockImplementation(changed);
    await choose(screen, "GitHub", "Disconnect");
    expect(await screen.findByRole("header", { name: "Disconnect GitHub?" })).toBeTruthy();
    expect(screen.getByText("Devices that signed in with it are signed out")).toBeTruthy();
    expect(screen.queryByText(/signs out too/)).toBeNull();
    expect(screen.getByRole("button", { name: "Keep It" })).toBeTruthy();
    expect(drop).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(drop).toHaveBeenCalledWith("github"));
  });

  it("warns that this phone signs out too, when it signed in that way", async () => {
    const { screen } = await open({ ...WITH_PASSWORD, current: "github" });
    await choose(screen, "GitHub", "Disconnect");
    expect(await screen.findByText(/signs out too, and keeps your data/)).toBeTruthy();
  });

  it("connects a provider through the browser, and can stop waiting", async () => {
    const { screen, data } = await open();
    const link = jest
      .spyOn(data.sync, "linkProvider")
      .mockImplementation(() => new Promise(() => {}));
    const cancel = jest.spyOn(data.sync, "cancelProviderSignIn").mockImplementation(() => {});
    await fireEvent.press(screen.getByRole("button", { name: "Connect Notion" }));
    await waitFor(() => expect(link).toHaveBeenCalledWith("notion"));
    expect(await screen.findByText("Waiting for Notion in your browser")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Stop Waiting" }));
    expect(cancel).toHaveBeenCalled();
  });

  it("adds Nookly Signin with an email confirmed by a code, and a password", async () => {
    const { screen, api, changed } = await open(ONLY_GITHUB);
    const send = jest.spyOn(api, "sendEmailCode").mockResolvedValue();
    const add = jest.spyOn(api, "addPassword").mockImplementation(changed);
    await fireEvent.press(screen.getByRole("button", { name: "Add Nookly Signin" }));
    await fireEvent.changeText(await screen.findByLabelText("Email"), "own@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send Code" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith("credential", "own@example.com"));
    await fireEvent.changeText(await screen.findByLabelText("Code from the email"), "123456");
    await fireEvent.changeText(screen.getByLabelText("New password"), "a long password");
    await fireEvent.changeText(screen.getByLabelText("Repeat new password"), "a long password");
    await fireEvent.press(screen.getAllByRole("button", { name: "Add Nookly Signin" }).at(-1)!);
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith("own@example.com", "123456", "a long password"),
    );
  });

  it("changes an email with the code sent to the new address", async () => {
    const { screen, api, changed } = await open();
    const send = jest.spyOn(api, "sendEmailCode").mockResolvedValue();
    const change = jest.spyOn(api, "changeEmail").mockImplementation(changed);
    await choose(screen, "Nookly Signin", "Change Email");
    await fireEvent.changeText(await screen.findByLabelText("Email"), "new@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send Code" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith("credential", "new@example.com"));
    expect(await screen.findByText(/We sent a code to new@example.com/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Code from the email"), "654321");
    await fireEvent.press(screen.getByRole("button", { name: "Change Email" }));
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith("credential", "new@example.com", "654321"),
    );
  });

  it("changes the password, typed twice and rated, but never refuses a weak one", async () => {
    const { screen, api, changed } = await open();
    const set = jest.spyOn(api, "setPassword").mockImplementation(changed);
    await choose(screen, "Nookly Signin", "Change Password");
    await screen.findByLabelText("New password");
    // Nothing to rate before there is a new password, and the old one is not asked for.
    expect(screen.queryByRole("progressbar", { name: "Password strength" })).toBeNull();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("New password"), "password1234");
    const meter = await screen.findByRole("progressbar", { name: "Password strength" });
    expect(meter.props.accessibilityValue.text).toMatch(/weak/i);
    await fireEvent.changeText(screen.getByLabelText("Repeat new password"), "password12345");
    await fireEvent.press(screen.getByRole("button", { name: "Change Password" }));
    expect(await screen.findByText("The passwords don't match")).toBeTruthy();
    expect(set).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Repeat new password"), "password1234");
    await fireEvent.press(screen.getByRole("button", { name: "Change Password" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("password1234"));
  });
});

/// A change the server refuses until the person has confirmed it is them.
function guarded<T>(done: () => Promise<T>) {
  const state = { confirmed: false, runs: 0 };
  return {
    state,
    change: async () => {
      state.runs += 1;
      if (!state.confirmed) {
        throw new ApiRequestError(403, "recheck_required", "Confirm it's you to continue.");
      }
      return done();
    },
  };
}

describe("confirming it is you", () => {
  async function asked(summary: SignInSummary = WITH_PASSWORD) {
    const account = await open(summary);
    const guard = guarded(account.changed);
    jest.spyOn(account.api, "setPrimary").mockImplementation(guard.change);
    jest.spyOn(account.data.sync, "disconnectProvider").mockImplementation(guard.change);
    return { ...account, ...guard };
  }

  it("takes the password, and the change goes through", async () => {
    const { screen, api, state } = await asked();
    const check = jest.spyOn(api, "recheck").mockImplementation(async () => {
      state.confirmed = true;
    });
    await choose(screen, "GitHub", "Make Primary");
    expect(await screen.findByRole("header", { name: "Confirm it's you" })).toBeTruthy();
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(check).toHaveBeenCalledWith({ password: "a long password" }));
    await waitFor(() => expect(state.runs).toBe(2));
  });

  it("goes on to a code when the account has two-factor", async () => {
    const { screen, api, state } = await asked({ ...WITH_PASSWORD, secondStep: ["totp"] });
    const check = jest.spyOn(api, "recheck").mockImplementation(async (input) => {
      if (!input.code) throw new ApiRequestError(403, "second_step_required", "Enter a code.");
      state.confirmed = true;
    });
    await choose(screen, "GitHub", "Make Primary");
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.changeText(await screen.findByLabelText("Authenticator code"), "123456");
    await waitFor(() =>
      expect(check).toHaveBeenLastCalledWith({
        password: "a long password",
        method: "totp",
        code: "123456",
      }),
    );
    await waitFor(() => expect(state.runs).toBe(2));
  });

  it("confirms through a provider, for an account without a password", async () => {
    const two: SignInSummary = {
      ...ONLY_GITHUB,
      methods: [...ONLY_GITHUB.methods, method("notion")],
    };
    const { screen, api, data, state } = await asked(two);
    const browser = jest.spyOn(data.sync, "confirmWithProvider").mockResolvedValue(true);
    const check = jest.spyOn(api, "recheck").mockImplementation(async () => {
      state.confirmed = true;
    });
    await choose(screen, "Notion", "Make Primary");
    const button = await screen.findByRole("button", { name: "Continue with GitHub" });
    expect(screen.queryByLabelText("Password")).toBeNull();
    await fireEvent.press(button);
    await waitFor(() => expect(check).toHaveBeenCalledWith({}));
    expect(browser).toHaveBeenCalledWith("github");
    await waitFor(() => expect(state.runs).toBe(2));
  });

  it("drops the change when cancelled, with nothing said", async () => {
    const { screen, state } = await asked();
    await choose(screen, "GitHub", "Make Primary");
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(recheck.store.getState().asking).toBe(false));
    expect(state.runs).toBe(1);
    expect(screen.queryByText("Not confirmed.")).toBeNull();
  });

  it("asks over the sheet the change came from, which is still there afterwards", async () => {
    const { screen, api, changed } = await open();
    const guard = guarded(changed);
    jest.spyOn(api, "setPassword").mockImplementation(guard.change);
    jest.spyOn(api, "recheck").mockImplementation(async () => {
      guard.state.confirmed = true;
    });
    await choose(screen, "Nookly Signin", "Change Password");
    await fireEvent.changeText(await screen.findByLabelText("New password"), "a newer password");
    await fireEvent.changeText(screen.getByLabelText("Repeat new password"), "a newer password");
    await fireEvent.press(screen.getByRole("button", { name: "Change Password" }));
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    // The form under the question keeps what was typed.
    expect(screen.getByLabelText("New password").props.value).toBe("a newer password");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(guard.state.runs).toBe(2));
  });
});
