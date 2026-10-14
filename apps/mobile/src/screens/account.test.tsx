import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { SignInScreen, SignUpScreen, WelcomeScreen } from "./AccountScreens.tsx";

const ADA = {
  id: "00000000-0000-4000-8000-0000000000aa",
  username: "ada",
  email: null,
  emailVerified: false,
  createdAt: "",
};

describe("the welcome screen", () => {
  it("offers an account, signing in, or none, and says nothing is needed to start", async () => {
    const data = testData();
    data.onboarded.set("");
    const screen = await renderScreens({ index: () => <WelcomeScreen /> }, data);
    expect(await screen.findByRole("button", { name: "Create Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
    expect(screen.getByText(/works fully offline/)).toBeTruthy();
  });

  it("remembers that it was answered when someone continues without an account", async () => {
    const data = testData();
    data.onboarded.set("");
    const screen = await renderScreens({ index: () => <WelcomeScreen /> }, data);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Continue Without an Account" }),
    );
    await waitFor(() => expect(data.onboarded.get()).toBe("1"));
  });
});

describe("signing in", () => {
  it("shows what is missing instead of doing nothing", async () => {
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    await fireEvent.press(await screen.findByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Enter your username or email")).toBeTruthy();
    expect(screen.getByText("Enter your password")).toBeTruthy();
  });

  it("signs in with a username on the server, and says why when it fails", async () => {
    const data = testData();
    const signIn = jest
      .spyOn(data.sync, "signIn")
      .mockRejectedValueOnce(new Error("The username or the password is wrong."));
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("The username or the password is wrong.")).toBeTruthy();
    signIn.mockResolvedValueOnce(ADA);
    await fireEvent.press(screen.getByRole("button", { name: "Couldn't sign in" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenLastCalledWith(
        expect.stringMatching(/^http/),
        "ada",
        "a long password",
      ),
    );
    await waitFor(() => expect(data.onboarded.get()).toBe("1"));
  });

  it("keeps the server tucked away until asked for", async () => {
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    expect(screen.queryByLabelText("Server")).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "Change Server" }));
    expect(screen.getByLabelText("Server")).toBeTruthy();
  });
});

describe("creating an account", () => {
  it("needs a username and a long enough password, the email being optional", async () => {
    const data = testData();
    const signUp = jest.spyOn(data.sync, "signUp").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username"), "ad a");
    await fireEvent.changeText(screen.getByLabelText("Password"), "short");
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Use only letters, digits, dots and underscores")).toBeTruthy();
    expect(screen.getByText("Use at least 10 characters")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Username"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(expect.stringMatching(/^http/), {
        username: "ada",
        email: undefined,
        password: "a long password",
      }),
    );
  });
});
