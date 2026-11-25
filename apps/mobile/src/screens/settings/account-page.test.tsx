import { ApiClient } from "@nookly/shared/api";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../../test/render.tsx";
import { AccountPage } from "./AccountPage.tsx";

function signedIn(provider: string | null = null) {
  const data = testData();
  const api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  jest.spyOn(api, "sessions").mockResolvedValue([
    {
      id: "s1",
      deviceName: "Ada's iPhone",
      platform: "ios",
      current: true,
      lastUsedAt: "2026-11-12T10:00:00Z",
      createdAt: "",
    },
    {
      id: "s2",
      deviceName: "MacBook Air",
      platform: "macos",
      current: false,
      lastUsedAt: "2026-11-11T10:00:00Z",
      createdAt: "",
    },
  ]);
  const revoke = jest.spyOn(api, "revokeSession").mockResolvedValue();
  jest.spyOn(api, "signInMethods").mockResolvedValue({
    methods: [],
    current: null,
    fresh: true,
    secondStep: [],
    offered: [],
  });
  const deleteAccount = jest.spyOn(api, "deleteAccount").mockResolvedValue();
  jest.spyOn(api, "security").mockResolvedValue({
    available: provider === null,
    required: false,
    enabled: true,
    email: { enabled: true, possible: true, address: "a@b.co", confirmed: true },
    authenticator: { enabled: false },
    backupCodesLeft: 10,
  });
  const detach = jest.spyOn(data.sync, "detach").mockResolvedValue();
  const confirm = jest.spyOn(data.sync, "confirmWithProvider").mockResolvedValue(true);
  jest.spyOn(data.sync, "account").mockReturnValue(api);
  data.sync.store.setState({
    user: {
      id: "00000000-0000-4000-8000-0000000000bb",
      username: "ada",
      email: "a@b.co",
      emailVerified: true,
      createdAt: "",
      termsVersion: null,
    },
    serverUrl: "https://sync.example.com",
  });
  jest.spyOn(api, "me").mockResolvedValue({
    id: "00000000-0000-4000-8000-0000000000bb",
    username: "ada",
    email: "a@b.co",
    emailVerified: true,
    createdAt: "",
    termsVersion: null,
    hasPassword: provider === null,
    providers: provider ? [provider] : [],
  });
  return { data, revoke, deleteAccount, detach, confirm };
}

describe("the Account page", () => {
  // The desktop's Account settings are cards: who and how sync is doing, a card per device
  // with a way to sign it out, the changes to review, then how the account signs in.
  it("shows the desktop's cards: account, devices, changes", async () => {
    const { data, revoke } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    expect(await screen.findByText("ada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync Now" })).toBeTruthy();
    expect(await screen.findByText("This device")).toBeTruthy();
    // Nothing waits for a decision, so the page says nothing about it.
    expect(screen.queryByText("Nothing to review")).toBeNull();
    expect(screen.getByText("https://sync.example.com")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign Out MacBook Air" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("s2"));
  });

  it("puts the sign in methods above the devices, and Delete Account last", async () => {
    const { data } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    expect(await screen.findByText("ada")).toBeTruthy();
    await screen.findByText("Two-factor sign in");
    const page = JSON.stringify(screen.toJSON());
    const at = (text: string) => page.indexOf(`"${text}"`);
    expect(at("Sign in methods")).toBeGreaterThan(-1);
    expect(at("Sign in methods")).toBeLessThan(at("Two-factor sign in"));
    expect(at("Two-factor sign in")).toBeLessThan(at("Devices"));
    expect(at("Devices")).toBeLessThan(at("Delete Account"));
  });

  it("shows whether two-factor sign in is on, and opens its sheet", async () => {
    const { data } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Two-factor sign in" }));
    expect(await screen.findByRole("button", { name: "Turn Off Emailed Codes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set Up Authenticator App" })).toBeTruthy();
  });

  it("has nothing about sharing, which is not possible yet", async () => {
    const { data } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    expect(await screen.findByText("ada")).toBeTruthy();
    expect(screen.queryByText(/Shared with me/i)).toBeNull();
    expect(screen.queryByText(/shared with you/i)).toBeNull();
  });

  it("deletes the account from a sheet that asks for the password", async () => {
    const { data, deleteAccount, detach } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    // Nothing to type on the page itself.
    expect(screen.queryByLabelText("Your password")).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete Account" }));
    expect(await screen.findByText("Removed from the server for good")).toBeTruthy();
    await fireEvent.changeText(await screen.findByLabelText("Your password"), "a long password");
    await fireEvent.press(screen.getAllByRole("button", { name: "Delete Account" }).at(-1)!);
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("a long password"));
    await waitFor(() => expect(detach).toHaveBeenCalled());
  });

  it("asks an account without a password to type a phrase, then sign in with its provider again", async () => {
    const { data, deleteAccount, detach, confirm } = signedIn("notion");
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete Account" }));
    expect(await screen.findByText("Removed from the server for good")).toBeTruthy();
    expect(await screen.findByText("You sign in with Notion once more")).toBeTruthy();
    expect(screen.queryByLabelText("Your password")).toBeNull();
    const phrase = await screen.findByLabelText("Type delete my account");
    // Nothing happens until the phrase is typed.
    await fireEvent.press(screen.getAllByRole("button", { name: "Delete Account" }).at(-1)!);
    expect(confirm).not.toHaveBeenCalled();
    await fireEvent.changeText(phrase, "delete my account");
    await fireEvent.press(screen.getAllByRole("button", { name: "Delete Account" }).at(-1)!);
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("notion"));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith(undefined));
    await waitFor(() => expect(detach).toHaveBeenCalled());
  });

  it("deletes nothing when the provider's browser is closed without confirming", async () => {
    const { data, deleteAccount, confirm } = signedIn("notion");
    confirm.mockResolvedValue(false);
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete Account" }));
    await fireEvent.changeText(
      await screen.findByLabelText("Type delete my account"),
      "delete my account",
    );
    await fireEvent.press(screen.getAllByRole("button", { name: "Delete Account" }).at(-1)!);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("asks before signing out, saying what goes and what stays", async () => {
    const { data } = signedIn();
    const signOut = jest
      .spyOn(data.sync, "signOut")
      .mockResolvedValue({ unsent: 0, backupPath: null });
    jest.spyOn(data.sync, "unsentCount").mockResolvedValue(2);
    jest.spyOn(data.sync, "missingFilesCount").mockResolvedValue(1);
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Sign Out" }));
    expect(await screen.findByText("Stays in your account and on your other devices")).toBeTruthy();
    expect(screen.getByText(/^Removed from this .+, back when you sign in$/)).toBeTruthy();
    expect(
      screen.getByText("Files go too, except ones your account doesn't have yet"),
    ).toBeTruthy();
    expect(await screen.findByText("2 changes not sent yet, backed up first")).toBeTruthy();
    const keep = screen.getByRole("checkbox", { name: "Keep a local copy" });
    expect(keep.props.accessibilityState.checked).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
    // Keeping a copy changes what happens, and says what the copy will miss.
    await fireEvent.press(keep);
    expect(screen.getByText(/^A copy stays on this .+ and works alone$/)).toBeTruthy();
    expect(screen.getByText("2 changes not sent yet, kept here")).toBeTruthy();
    expect(
      await screen.findByText(/^1 file not on this .+ yet, missing from the copy$/),
    ).toBeTruthy();
    await fireEvent.press(screen.getAllByRole("button", { name: "Sign Out" }).at(-1)!);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ keepLocalCopy: true }));
  });

  it("stays signed in when that is the answer", async () => {
    const { data } = signedIn();
    const signOut = jest.spyOn(data.sync, "signOut");
    jest.spyOn(data.sync, "unsentCount").mockResolvedValue(0);
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Sign Out" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Stay Signed In" }));
    await waitFor(() => expect(screen.queryByText("Stay Signed In")).toBeNull());
    expect(signOut).not.toHaveBeenCalled();
  });

  it("says what an account is for when signed out, with the ways in", async () => {
    const screen = await renderScreens({ index: () => <AccountPage /> }, testData());
    expect(await screen.findByText("Not signed in")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
  });
});
