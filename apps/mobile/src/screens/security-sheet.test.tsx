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
    expect(screen.getByText(/asks for a second step/)).toBeTruthy();
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

  it("adds an authenticator app: the key to scan, a code to prove it, recovery codes once", async () => {
    const { data, api } = owing();
    jest.spyOn(api, "startAuthenticator").mockResolvedValue({
      uri: "otpauth://totp/Nookly:ada?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Nookly",
      key: "ABCD EFGH IJKL",
    });
    const confirm = jest
      .spyOn(api, "confirmAuthenticator")
      .mockResolvedValue(["aaaaa-bbbbb", "ccccc-ddddd"]);
    const screen = await renderScreens({ index: () => <SecurityGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Set Up Authenticator App" }));
    await fireEvent.changeText(await screen.findByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("QR code for your authenticator app")).toBeTruthy();
    expect(screen.getByText("ABCD EFGH IJKL")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Code from the app"), "123 456");
    await fireEvent.press(screen.getByRole("button", { name: "Turn On" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("123456"));

    expect(await screen.findByText("aaaaa-bbbbb")).toBeTruthy();
    expect(screen.getByText("ccccc-ddddd")).toBeTruthy();
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
