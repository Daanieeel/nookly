import { configure } from "@testing-library/react-native";
import { ApiClient, ApiRequestError, type SecuritySummary } from "@nookly/shared/api";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { Button } from "../ui/Button.tsx";
import { recheck } from "./recheck.ts";
import { SecurityGate, useOpenSecurity } from "./SecurityGate.tsx";
import { UsernameGate } from "./UsernameGate.tsx";
import { useSecurityGate } from "./security-gate-store.ts";
import { useUsernameGate } from "./username-gate-store.ts";

// Sheets go away on timers before what was chosen in them runs, which takes longer than the
// usual second when every suite runs at once.
configure({ asyncUtilTimeout: 10_000 });

const ADA = {
  id: "00000000-0000-4000-8000-0000000000aa",
  username: "ada",
  email: "ada@example.com",
  emailVerified: true,
  createdAt: "",
  termsVersion: null,
  needsUsername: false,
};

const NOTHING: SecuritySummary = {
  available: true,
  required: true,
  enabled: false,
  email: { enabled: false, possible: true, address: "ada@example.com", confirmed: true },
  authenticator: { enabled: false },
  backupCodesLeft: 0,
};

function owing() {
  const data = testData();
  const api = new ApiClient({
    baseUrl: "https://sync.nookly.work",
    tokens: { load: async () => null, save: async () => {} },
  });
  let summary = NOTHING;
  jest.spyOn(api, "security").mockImplementation(async () => summary);
  jest.spyOn(data.sync, "account").mockReturnValue(api);
  jest.spyOn(data.sync, "twoFactorChanged").mockResolvedValue();
  data.sync.store.setState({
    user: { ...ADA, twoFactorRequired: true },
    serverUrl: "https://sync.nookly.work",
    twoFactorPending: true,
  });
  return {
    data,
    api,
    set: (next: SecuritySummary) => {
      summary = next;
    },
  };
}

afterEach(() => {
  act(() => {
    useSecurityGate.getState().reset();
    useUsernameGate.setState({ dismissed: false });
    recheck.finish(false);
  });
});

describe("the security sheet", () => {
  it("rises for an account that owes two-factor, and says why", async () => {
    const { data } = owing();
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(await screen.findByRole("button", { name: "Set Up Authenticator App" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn On Emailed Codes" })).toBeTruthy();
    expect(screen.getByText(/Sign in needs a second step/)).toBeTruthy();
  });

  it("stays away from an account that owes nothing", async () => {
    const { data } = owing();
    data.sync.store.setState({
      user: { ...ADA, twoFactorRequired: false },
      twoFactorPending: false,
    });
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(screen.queryByRole("button", { name: "Set Up Authenticator App" })).toBeNull();
  });

  it("turns on emailed codes, once what that does was said", async () => {
    const { data, api, set } = owing();
    const enable = jest.spyOn(api, "enableEmailTwoFactor").mockImplementation(async () => {
      set({ ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } });
      return NOTHING;
    });
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
    expect(await screen.findByText(/emails a code to your address/)).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(enable).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(enable).toHaveBeenCalled());
    expect(data.sync.twoFactorChanged).toHaveBeenCalled();
  });

  it("asks to confirm it is you when the server wants that", async () => {
    const { data, api } = owing();
    let confirmed = false;
    const enable = jest.spyOn(api, "enableEmailTwoFactor").mockImplementation(async () => {
      if (!confirmed) throw new ApiRequestError(403, "recheck_required", "Confirm it's you.");
      return NOTHING;
    });
    jest.spyOn(api, "signInMethods").mockResolvedValue({
      methods: [
        {
          provider: "credential",
          email: ADA.email,
          emailVerified: true,
          primary: true,
          canBePrimary: false,
        },
      ],
      current: "credential",
      fresh: false,
      secondStep: [],
      offered: [],
    });
    jest.spyOn(api, "recheck").mockImplementation(async () => {
      confirmed = true;
    });
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("header", { name: "Confirm it's you" })).toBeTruthy();
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getAllByRole("button", { name: "Continue" }).at(-1)!);
    await waitFor(() => expect(enable).toHaveBeenCalledTimes(2));
  });

  it("can't be put off: signing out keeps a copy", async () => {
    const { data } = owing();
    const signOut = jest
      .spyOn(data.sync, "signOut")
      .mockResolvedValue({ unsent: 0, backupPath: null });
    jest.spyOn(data.sync, "unsentCount").mockResolvedValue(0);
    jest.spyOn(data.sync, "missingFilesCount").mockResolvedValue(0);
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(await screen.findByRole("button", { name: "Sign Out" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Later" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));
    expect(
      (await screen.findByRole("checkbox", { name: "Keep a local copy" })).props.accessibilityState
        .checked,
    ).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ keepLocalCopy: true }));
  });

  it("is closed with Done when it was opened from Settings", async () => {
    const { data, set } = owing();
    set({ ...NOTHING, required: false, enabled: true });
    data.sync.store.setState({
      user: { ...ADA, twoFactorRequired: false },
      twoFactorPending: false,
    });
    function Opener() {
      const open = useOpenSecurity();
      return <Button label="Open" onPress={open} />;
    }
    const screen = await renderScreens({ index: () => <Opener /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Open" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("Authenticator app")).toBeNull());
  });

  it("lets a sheet that goes up with it go first", async () => {
    const { data } = owing();
    data.sync.store.setState({
      user: { ...ADA, twoFactorRequired: true, needsUsername: true },
    });
    const screen = await renderScreens(
      {
        index: () => (
          <>
            <UsernameGate />
            <SecurityGate />
          </>
        ),
      },
      data,
    );
    expect(await screen.findByRole("button", { name: "Save Username" })).toBeTruthy();
    expect(screen.queryByText("Authenticator app")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Not Now" }));
    // It takes its turn once the other sheet has had time to go.
    expect(await screen.findByText("Authenticator app")).toBeTruthy();
  });

  it("adds an authenticator app, goes back to the list, and shows the recovery codes from Continue", async () => {
    const { data, api, set } = owing();
    jest.spyOn(api, "startAuthenticator").mockResolvedValue({
      uri: "otpauth://totp/Nookly:ada?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Nookly",
      key: "ABCD EFGH IJKL",
    });
    const confirm = jest.spyOn(api, "confirmAuthenticator").mockImplementation(async () => {
      set({ ...NOTHING, enabled: true, authenticator: { enabled: true }, backupCodesLeft: 2 });
      return ["aaaaa-bbbbb", "ccccc-ddddd"];
    });
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Set Up Authenticator App" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("QR code for your authenticator app")).toBeTruthy();
    // The key is for typing by hand: shown as it is, with a button to copy it.
    expect(screen.getByText("ABCD EFGH IJKL")).toBeTruthy();
    expect(screen.getByText("or set up manually")).toBeTruthy();
    expect(screen.queryByLabelText("Show key")).toBeNull();
    expect(screen.getByLabelText("Copy key")).toBeTruthy();
    // Six boxes; the last digit turns it on.
    expect(screen.getAllByTestId(/^otp-box-/)).toHaveLength(6);
    await fireEvent.changeText(screen.getByLabelText("Code from the app"), "123 456");
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("123456"));

    // Back on the list, where another way can be added, with Continue to go on.
    expect(await screen.findByRole("button", { name: "Turn On Emailed Codes" })).toBeTruthy();
    expect(screen.queryByText("aaaaa-bbbbb")).toBeNull();
    expect(screen.queryByRole("button", { name: "Get New Codes" })).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("aaaaa-bbbbb")).toBeTruthy();
    expect(screen.getByText("ccccc-ddddd")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "I Saved Them" }));
    await waitFor(() => expect(screen.queryByText("aaaaa-bbbbb")).toBeNull());
  });

  it("lets an account that owes two-factor be deleted instead, keeping this phone's data", async () => {
    const { data, api } = owing();
    jest.spyOn(api, "me").mockResolvedValue({ ...ADA, hasPassword: true });
    const remove = jest.spyOn(api, "deleteAccount").mockResolvedValue();
    const detach = jest.spyOn(data.sync, "detach").mockResolvedValue();
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete Account" }));
    expect(await screen.findByText("Removed from the server for good")).toBeTruthy();
    await fireEvent.changeText(await screen.findByLabelText("Your password"), "a long password");
    await fireEvent.press(screen.getAllByRole("button", { name: "Delete Account" }).at(-1)!);
    await waitFor(() => expect(remove).toHaveBeenCalledWith("a long password"));
    await waitFor(() => expect(detach).toHaveBeenCalled());
  });

  it("lists emailed codes first, with no sentence explaining the obvious", async () => {
    const { data } = owing();
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    const email = await screen.findByText("Emailed codes");
    const app = screen.getByText("Authenticator app");
    const titles = screen.getAllByText(/^(Emailed codes|Authenticator app)$/);
    expect(titles.indexOf(email)).toBeLessThan(titles.indexOf(app));
    expect(screen.queryByText("A code from an app on your phone.")).toBeNull();
    expect(screen.queryByText("Needs an email address.")).toBeNull();
  });

  it("offers Continue once a method is on, and not before", async () => {
    const { data, set } = owing();
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(await screen.findByRole("button", { name: "Set Up Authenticator App" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    set({ ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } });
    const again = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(await again.findByRole("button", { name: "Continue" })).toBeTruthy();
    expect(again.queryByRole("button", { name: "Proceed Without Authenticator" })).toBeNull();
  });

  it("makes recovery codes when only emailed codes are on", async () => {
    const { data, api, set } = owing();
    set({ ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } });
    const codes = jest.spyOn(api, "newBackupCodes").mockResolvedValue(["eeeee-fffff"]);
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(codes).toHaveBeenCalled());
    expect(await screen.findByText("eeeee-fffff")).toBeTruthy();
  });

  it("does not tell an unconfirmed address to be confirmed first", async () => {
    const { data, set } = owing();
    set({
      ...NOTHING,
      email: { enabled: false, possible: false, address: "ada@example.com", confirmed: false },
    });
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(await screen.findByRole("button", { name: "Send Confirmation Link" })).toBeTruthy();
    expect(screen.queryByText(/Confirm ada@example.com first/)).toBeNull();
  });

  it("asks an account with no email for one", async () => {
    const { data, api, set } = owing();
    set({
      ...NOTHING,
      email: { enabled: false, possible: false, address: null, confirmed: false },
    });
    const add = jest.spyOn(api, "addEmail").mockResolvedValue({ ...ADA, email: "ada@new.test" });
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Add an Email Address" }));
    await fireEvent.changeText(await screen.findByLabelText("Email"), "ada@new.test");
    await fireEvent.press(screen.getByRole("button", { name: "Send Confirmation" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("ada@new.test"));
  });
});
