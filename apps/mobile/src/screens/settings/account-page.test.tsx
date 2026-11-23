import { ApiClient } from "@nookly/shared/api";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../../test/render.tsx";
import type { MenuPresenter } from "../../ui/menu.tsx";
import { AccountPage } from "./AccountPage.tsx";

function signedIn() {
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
  const change = jest.spyOn(api, "changePassword").mockResolvedValue();
  const deleteAccount = jest.spyOn(api, "deleteAccount").mockResolvedValue();
  jest.spyOn(api, "security").mockResolvedValue({
    available: true,
    required: false,
    enabled: true,
    email: { enabled: true, possible: true, address: "a@b.co", confirmed: true },
    authenticator: { enabled: false },
    backupCodesLeft: 10,
  });
  const detach = jest.spyOn(data.sync, "detach").mockResolvedValue();
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
  return { data, revoke, change, deleteAccount, detach };
}

describe("the Account page", () => {
  // The desktop's Account settings are cards: who and how sync is doing, a card per device
  // with a way to sign it out, the changes to review, then the password and the server.
  it("shows the desktop's cards: account, devices, changes, password", async () => {
    const { data, revoke, change } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    expect(await screen.findByText("ada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync Now" })).toBeTruthy();
    expect(await screen.findByText("This device")).toBeTruthy();
    // Nothing waits for a decision, so the page says nothing about it.
    expect(screen.queryByText("Nothing to review")).toBeNull();
    expect(screen.getByText("https://sync.example.com")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign Out MacBook Air" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("s2"));
    // The password form is not on the page: a row opens it in a sheet.
    expect(screen.queryByLabelText("Current password")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Change Password" }));
    await fireEvent.changeText(await screen.findByLabelText("Current password"), "old password");
    await fireEvent.changeText(screen.getByLabelText("New password"), "a much newer password");
    await fireEvent.changeText(
      screen.getByLabelText("Repeat new password"),
      "a much newer password",
    );
    await fireEvent.press(screen.getAllByRole("button", { name: "Change Password" }).at(-1)!);
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith("old password", "a much newer password"),
    );
  });

  it("puts Change Password above the devices, and Delete Account last", async () => {
    const { data } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    expect(await screen.findByText("ada")).toBeTruthy();
    const page = JSON.stringify(screen.toJSON());
    const at = (text: string) => page.indexOf(`"${text}"`);
    expect(at("Change Password")).toBeGreaterThan(-1);
    expect(at("Change Password")).toBeLessThan(at("Devices"));
    expect(at("Devices")).toBeLessThan(at("Delete Account"));
  });

  it("shows whether two-factor sign in is on, and opens its sheet", async () => {
    const { data } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Two-factor sign in" }));
    expect(await screen.findByRole("button", { name: "Turn Off Emailed Codes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set Up Authenticator App" })).toBeTruthy();
  });

  it("asks for the new password twice and rates it, but never refuses a weak one", async () => {
    const { data, change } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Change Password" }));
    await fireEvent.changeText(await screen.findByLabelText("Current password"), "old password");
    // Nothing to rate before there is a new password.
    expect(screen.queryByRole("progressbar", { name: "Password strength" })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("New password"), "password1234");
    const meter = await screen.findByRole("progressbar", { name: "Password strength" });
    expect(meter.props.accessibilityValue.text).toMatch(/weak/i);
    // Two different entries are caught.
    await fireEvent.changeText(screen.getByLabelText("Repeat new password"), "password12345");
    await fireEvent.press(screen.getAllByRole("button", { name: "Change Password" }).at(-1)!);
    expect(await screen.findByText("The passwords don't match")).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
    // A weak password goes through once it is typed twice: the bar only advises.
    await fireEvent.changeText(screen.getByLabelText("Repeat new password"), "password1234");
    await fireEvent.press(screen.getAllByRole("button", { name: "Change Password" }).at(-1)!);
    await waitFor(() => expect(change).toHaveBeenCalledWith("old password", "password1234"));
  });

  it("rates a strong password strong", async () => {
    const { data } = signedIn();
    const screen = await renderScreens({ index: () => <AccountPage /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Change Password" }));
    await fireEvent.changeText(
      await screen.findByLabelText("New password"),
      "violet lantern kettle orbit ferment",
    );
    const meter = await screen.findByRole("progressbar", { name: "Password strength" });
    expect(meter.props.accessibilityValue.text).toBe("Strong");
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

  it("asks before signing out, as a warning and not as a deletion", async () => {
    const { data } = signedIn();
    const confirm = jest.fn();
    const menu: MenuPresenter = { show: jest.fn(), confirm };
    const screen = await renderScreens({ index: () => <AccountPage /> }, data, "/", { menu });
    await fireEvent.press(await screen.findByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const [confirmation] = confirm.mock.calls[0];
    expect(confirmation.actions).toEqual([
      expect.objectContaining({ label: "Sign Out", warning: true }),
    ]);
    expect(confirmation.actions[0].destructive).toBeUndefined();
    // Short lines, not a paragraph.
    expect(confirmation.description).toBeUndefined();
    const lines = confirmation.points.map((point: { text: string }) => point.text);
    expect(lines).toEqual(
      expect.arrayContaining([
        "Stays in your account and on your other devices",
        expect.stringMatching(/^Removed from this .+, back when you sign in$/),
      ]),
    );
    for (const line of lines) expect(line.length).toBeLessThan(70);
  });

  it("says what an account is for when signed out, with the ways in", async () => {
    const screen = await renderScreens({ index: () => <AccountPage /> }, testData());
    expect(await screen.findByText("Not signed in")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
  });
});
