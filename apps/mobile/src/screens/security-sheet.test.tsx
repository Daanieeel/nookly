import { ApiClient, type SecuritySummary } from "@nookly/shared/api";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { SecurityGate } from "./SecurityGate.tsx";
import { useSecurityGate } from "./security-gate-store.ts";

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
  act(() => useSecurityGate.getState().reset());
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

  it("turns on emailed codes with the password", async () => {
    const { data, api, set } = owing();
    const enable = jest.spyOn(api, "enableEmailTwoFactor").mockImplementation(async () => {
      set({ ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } });
      return NOTHING;
    });
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(enable).toHaveBeenCalledWith("a long password"));
    expect(data.sync.twoFactorChanged).toHaveBeenCalled();
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
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

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

  it("offers Continue once a method is on, and Later before", async () => {
    const { data, set } = owing();
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(await screen.findByRole("button", { name: "Later" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    set({ ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } });
    const again = await renderScreens({ index: () => <SecurityGate /> }, data);
    expect(await again.findByRole("button", { name: "Continue" })).toBeTruthy();
    expect(again.queryByRole("button", { name: "Proceed Without Authenticator" })).toBeNull();
  });

  it("makes recovery codes with the password when only emailed codes are on", async () => {
    const { data, api, set } = owing();
    set({ ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } });
    const codes = jest.spyOn(api, "newBackupCodes").mockResolvedValue(["eeeee-fffff"]);
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Continue" }));
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(codes).toHaveBeenCalledWith("a long password"));
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
