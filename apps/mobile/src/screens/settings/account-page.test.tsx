import { ApiClient } from "@nookly/shared/api";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../../test/render.tsx";
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
  jest.spyOn(api, "sharesWithMe").mockResolvedValue([]);
  const revoke = jest.spyOn(api, "revokeSession").mockResolvedValue();
  const change = jest.spyOn(api, "changePassword").mockResolvedValue();
  jest.spyOn(data.sync, "account").mockReturnValue(api);
  data.sync.store.setState({
    user: {
      id: "00000000-0000-4000-8000-0000000000bb",
      username: "ada",
      email: "a@b.co",
      emailVerified: true,
      createdAt: "",
    },
    serverUrl: "https://sync.example.com",
  });
  return { data, revoke, change };
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
    expect(screen.getByText("Nothing to review")).toBeTruthy();
    expect(screen.getByText("https://sync.example.com")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign Out MacBook Air" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("s2"));
    await fireEvent.changeText(screen.getByLabelText("Current password"), "old password");
    await fireEvent.changeText(screen.getByLabelText("New password"), "a much newer password");
    await fireEvent.press(screen.getByRole("button", { name: "Change Password" }));
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith("old password", "a much newer password"),
    );
  });

  it("says what an account is for when signed out, with the ways in", async () => {
    const screen = await renderScreens({ index: () => <AccountPage /> }, testData());
    expect(await screen.findByText("Not signed in")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
  });
});
