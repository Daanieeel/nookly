import { PRODUCTION_SERVER, TERMS_VERSION } from "@nookly/shared/api";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { AccountPage } from "./settings/AccountPage.tsx";
import { TermsGate } from "./TermsGate.tsx";

const ADA = {
  id: "00000000-0000-4000-8000-0000000000aa",
  username: "ada",
  email: null,
  emailVerified: false,
  createdAt: "",
  termsVersion: null,
};

function owing() {
  const data = testData();
  data.sync.store.setState({ user: ADA, serverUrl: PRODUCTION_SERVER, termsPending: true });
  return data;
}

describe("the terms sheet", () => {
  it("stays away while nothing is owed", async () => {
    const data = testData();
    const screen = await renderScreens({ index: () => <TermsGate /> }, data);
    expect(screen.queryByRole("button", { name: "Agree and Continue" })).toBeNull();
  });

  it("rises when the account has not agreed, says sync waits and links the texts", async () => {
    const data = owing();
    const screen = await renderScreens({ index: () => <TermsGate /> }, data);
    expect(await screen.findByRole("button", { name: "Agree and Continue" })).toBeTruthy();
    expect(screen.getByText(/Sync stays paused on this/)).toBeTruthy();
    expect(screen.getByText(/at least 18/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeTruthy();
  });

  it("agrees, and sync carries on", async () => {
    const data = owing();
    const accept = jest.spyOn(data.sync, "acceptTerms").mockImplementation(async () => {
      data.sync.store.setState({ termsPending: false });
    });
    const screen = await renderScreens({ index: () => <TermsGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Agree and Continue" }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(TERMS_VERSION).toBeTruthy();
  });

  it("shows why agreeing failed, and stays", async () => {
    const data = owing();
    jest.spyOn(data.sync, "acceptTerms").mockRejectedValue(new Error("Can't reach the server."));
    const screen = await renderScreens({ index: () => <TermsGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Agree and Continue" }));
    expect(await screen.findByText("Can't reach the server.")).toBeTruthy();
  });

  it("can wait, and the Account page brings it back", async () => {
    const data = owing();
    const screen = await renderScreens(
      {
        index: () => (
          <>
            <TermsGate />
            <AccountPage />
          </>
        ),
      },
      data,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Not Now" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Agree and Continue" })).toBeNull(),
    );
    expect(screen.getByText(/Sync is paused on this/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Review Terms" }));
    expect(await screen.findByRole("button", { name: "Agree and Continue" })).toBeTruthy();
    await act(async () => {});
  });
});
