import { PRODUCTION_SERVER } from "@nookly/shared/api";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { UsernameGate } from "./UsernameGate.tsx";

const GRACE = {
  id: "00000000-0000-4000-8000-0000000000bb",
  username: "Grace Hopper",
  email: "grace@example.com",
  emailVerified: true,
  createdAt: "",
  termsVersion: null,
  needsUsername: true,
};

function withoutUsername() {
  const data = testData();
  data.sync.store.setState({ user: GRACE, serverUrl: PRODUCTION_SERVER });
  return data;
}

describe("the username sheet", () => {
  it("stays away from an account that has a username", async () => {
    const data = testData();
    data.sync.store.setState({ user: { ...GRACE, needsUsername: false } });
    const screen = await renderScreens({ index: () => <UsernameGate /> }, data);
    expect(screen.queryByRole("button", { name: "Save Username" })).toBeNull();
  });

  it("rises for an account made with a provider, with a name to start from", async () => {
    const screen = await renderScreens({ index: () => <UsernameGate /> }, withoutUsername());
    expect(await screen.findByRole("button", { name: "Save Username" })).toBeTruthy();
    expect(screen.getByLabelText("Username").props.value).toBe("grace_hopper");
  });

  it("saves the name that was typed", async () => {
    const data = withoutUsername();
    const choose = jest.spyOn(data.sync, "chooseUsername").mockImplementation(async (username) => {
      const user = { ...GRACE, username, needsUsername: false };
      data.sync.store.setState({ user });
      return user;
    });
    const screen = await renderScreens({ index: () => <UsernameGate /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username"), "grace_h");
    await fireEvent.press(screen.getByRole("button", { name: "Save Username" }));
    await waitFor(() => expect(choose).toHaveBeenCalledWith("grace_h"));
  });

  it("checks the name before sending it", async () => {
    const data = withoutUsername();
    const choose = jest.spyOn(data.sync, "chooseUsername");
    const screen = await renderScreens({ index: () => <UsernameGate /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username"), "no spaces");
    await fireEvent.press(screen.getByRole("button", { name: "Save Username" }));
    expect(await screen.findByText(/letters, numbers, dots or underscores/)).toBeTruthy();
    expect(choose).not.toHaveBeenCalled();
  });

  it("shows why a name was refused, and stays", async () => {
    const data = withoutUsername();
    jest
      .spyOn(data.sync, "chooseUsername")
      .mockRejectedValue(new Error("That username is taken. Try another one."));
    const screen = await renderScreens({ index: () => <UsernameGate /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Save Username" }));
    expect(await screen.findByText("That username is taken. Try another one.")).toBeTruthy();
    // Still asking: the field is there to try another name.
    expect(screen.getByLabelText("Username")).toBeTruthy();
  });

  it("can wait", async () => {
    const screen = await renderScreens({ index: () => <UsernameGate /> }, withoutUsername());
    await fireEvent.press(await screen.findByRole("button", { name: "Not Now" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save Username" })).toBeNull());
    await act(async () => {});
  });
});
