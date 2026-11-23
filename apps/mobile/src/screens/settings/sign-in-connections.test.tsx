import { ApiClient } from "@nookly/shared/api";
import { fakeMoodle } from "../../test/fake-moodle.tsx";
import { renderScreens, testData } from "../../test/render.tsx";
import { CalendarConnectionsPage } from "./CalendarConnectionsPage.tsx";

const ADA = {
  id: "00000000-0000-4000-8000-0000000000bb",
  username: "ada",
  email: "ada@example.com",
  emailVerified: true,
  createdAt: "",
  termsVersion: null,
};

function signedInWith(extra: { hasPassword: boolean; providers: string[] }) {
  const data = testData();
  const api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  jest.spyOn(api, "me").mockResolvedValue({ ...ADA, ...extra });
  jest.spyOn(data.sync, "account").mockReturnValue(api);
  data.sync.store.setState({
    user: { ...ADA, ...extra },
    serverUrl: "https://sync.example.com",
  });
  return data;
}

describe("how you sign in, on the Connections page", () => {
  it("lists the provider an account was made with", async () => {
    const data = signedInWith({ hasPassword: false, providers: ["notion"] });
    const screen = await renderScreens(
      { index: fakeMoodle().wrap(<CalendarConnectionsPage />) },
      data,
    );
    expect(await screen.findByText("Notion")).toBeTruthy();
    expect(screen.getByText("Signs you in to Nookly")).toBeTruthy();
    expect(screen.queryByText("Email and password")).toBeNull();
  });

  it("lists every way the account signs in, the password included", async () => {
    const data = signedInWith({ hasPassword: true, providers: ["google", "github"] });
    const screen = await renderScreens(
      { index: fakeMoodle().wrap(<CalendarConnectionsPage />) },
      data,
    );
    expect(await screen.findByText("Google")).toBeTruthy();
    expect(screen.getByText("GitHub")).toBeTruthy();
    expect(screen.getByText("Email and password")).toBeTruthy();
  });

  it("says nothing about signing in when nobody is signed in", async () => {
    const screen = await renderScreens(
      { index: fakeMoodle().wrap(<CalendarConnectionsPage />) },
      testData(),
    );
    expect(await screen.findByText("Sign in to Nookly to see how you sign in.")).toBeTruthy();
  });
});
