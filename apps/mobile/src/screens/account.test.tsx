import { PRODUCTION_SERVER, TERMS_VERSION, TwoFactorRequiredError } from "@nookly/shared/api";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { Keyboard, TextInput } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { SignInScreen, SignUpScreen, WelcomeScreen } from "./AccountScreens.tsx";

const ADA = {
  id: "00000000-0000-4000-8000-0000000000aa",
  username: "ada",
  email: null,
  emailVerified: false,
  createdAt: "",
  termsVersion: null,
  needsUsername: false,
};

const TICK = { name: /at least 18 and agree to the Terms of Service/ };

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

describe("the legal links", () => {
  it.each([
    ["signing in", () => <SignInScreen />],
    ["creating an account", () => <SignUpScreen />],
  ] as const)("are at the foot of %s", async (_name, screenOf) => {
    const screen = await renderScreens({ index: screenOf });
    for (const name of ["Terms of Service", "Privacy Policy", "Imprint"]) {
      expect((await screen.findAllByRole("link", { name })).length).toBeGreaterThan(0);
    }
  });
});

describe("signing in", () => {
  it("leads with signing in, keeps a forgotten password quiet, and invites someone new", async () => {
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Forgot Password" })).toBeTruthy();
    expect(screen.getByText("New to Nookly?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
    expect(screen.queryByText("Create an Account Instead")).toBeNull();
    // The test server has no providers: all four are there, none works.
    for (const provider of ["Google", "Apple", "GitHub", "Notion"]) {
      expect(screen.getByRole("button", { name: `Sign in with ${provider}` })).toBeDisabled();
    }
  });

  it("shows what is missing instead of doing nothing", async () => {
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    await fireEvent.press(await screen.findByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Enter your username or email")).toBeTruthy();
    expect(screen.getByText("Enter your password")).toBeTruthy();
    // The button waits until both fields are right.
    expect(screen.getByRole("button", { name: "Sign In" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Username or email"), "ada");
    expect(screen.getByRole("button", { name: "Sign In" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled());
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
    // After a wrong answer both fields are drawn invalid, and the button waits until each of
    // them was changed.
    expect(screen.getByLabelText("Username or email").props["aria-invalid"]).toBe(true);
    expect(screen.getByLabelText("Password").props["aria-invalid"]).toBe(true);
    expect(screen.getByRole("button", { name: "Couldn't sign in" })).toBeDisabled();
    signIn.mockResolvedValueOnce(ADA);
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props["aria-invalid"]).toBe(false),
    );
    expect(screen.getByLabelText("Username or email").props["aria-invalid"]).toBe(true);
    expect(screen.getByRole("button", { name: "Couldn't sign in" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Username or email"), "ada2");
    await fireEvent.changeText(screen.getByLabelText("Username or email"), "ada");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled());
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenLastCalledWith(
        expect.stringMatching(/^http/),
        "ada",
        "a long password",
        {},
      ),
    );
    await waitFor(() => expect(data.onboarded.get()).toBe("1"));
  });

  it("shows or hides the typed password with an eye, without drawing the field again", async () => {
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    const password = await screen.findByLabelText("Password");
    const change = jest.spyOn(TextInput.prototype, "setNativeProps");
    await fireEvent.changeText(password, "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Show password" }));
    expect(change).toHaveBeenLastCalledWith({ secureTextEntry: false });
    await fireEvent.press(screen.getByRole("button", { name: "Hide password" }));
    expect(change).toHaveBeenLastCalledWith({ secureTextEntry: true });
    // The input itself is never given another value: it was not rendered again, and what was
    // typed is still in it.
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Password").props.value).toBe("a long password");
  });

  it("locks the fields while it signs in", async () => {
    const data = testData();
    let finish: (user: typeof ADA) => void = () => {};
    jest.spyOn(data.sync, "signIn").mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(screen.getByLabelText("Password").props.editable).toBe(false));
    expect(screen.getByLabelText("Username or email").props.editable).toBe(false);
    finish(ADA);
    await waitFor(() => expect(data.onboarded.get()).toBe("1"));
  });

  it("closes the keyboard once signed in, before the importing screen shows", async () => {
    const data = testData();
    jest.spyOn(data.sync, "signIn").mockResolvedValueOnce(ADA);
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    dismiss.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(data.onboarded.get()).toBe("1"));
    expect(dismiss).toHaveBeenCalled();
  });

  it("asks what happens to what is on this phone, and signs in with the answer", async () => {
    const data = testData();
    jest.spyOn(data.sync, "localDataCount").mockResolvedValue(12);
    const signIn = jest.spyOn(data.sync, "signIn").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    expect(await screen.findByText(/This iPhone already holds 12 items/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    // Nothing joins an account, and nothing is cleared, without an answer.
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Choose one of the two first.")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("radio", { name: "Keep out of the account" }));
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        expect.stringMatching(/^http/),
        "ada",
        "a long password",
        {
          localData: "setAside",
        },
      ),
    );
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
    data.serverUrl.set(PRODUCTION_SERVER);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username"), "ad a");
    await fireEvent.changeText(screen.getByLabelText("Password"), "short");
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Use only letters, digits, dots and underscores")).toBeTruthy();
    expect(screen.getByText("Use at least 10 characters")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Username"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.changeText(screen.getByLabelText("Repeat password"), "a long password");
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    // Nookly's server is a closed beta: no key, no account.
    expect(await screen.findByText("Enter the beta key to create an account.")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Beta key"), " the-key ");
    await fireEvent.press(await screen.findByRole("button", { name: "Create Account" }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        PRODUCTION_SERVER,
        {
          username: "ada",
          email: undefined,
          password: "a long password",
          betaKey: "the-key",
          termsVersion: TERMS_VERSION,
        },
        {},
      ),
    );
  });

  it("names the fields above them, gives the main ones placeholders and shows how strong the password is", async () => {
    const data = testData();
    data.serverUrl.set(PRODUCTION_SERVER);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await screen.findByLabelText("Username");
    for (const name of ["Username", "Email (optional)", "Password", "Beta key"]) {
      // The drawn name, which may carry a star for a required field.
      expect(
        screen.getByText(new RegExp(`^${name.replace(/[()]/g, "\\$&")}( \\*)?$`)),
      ).toBeTruthy();
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    // The repeat field has no name drawn, only its placeholder and a name for screen readers.
    expect(screen.queryByText(/^Repeat password/)).toBeNull();
    expect(screen.getByLabelText("Repeat password")).toBeTruthy();
    for (const placeholder of ["Username", "Password", "Repeat password"]) {
      expect(screen.getByPlaceholderText(placeholder)).toBeTruthy();
    }
    // How strong the password is shows under the repeat field once one is typed.
    expect(screen.queryByRole("progressbar", { name: "Password strength" })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Password"), "password123");
    expect(await screen.findByRole("progressbar", { name: "Password strength" })).toBeTruthy();
  });

  it("will not create an account until the terms are agreed to, and links the texts", async () => {
    const data = testData();
    const signUp = jest.spyOn(data.sync, "signUp").mockResolvedValue(ADA);
    data.serverUrl.set(PRODUCTION_SERVER);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.changeText(screen.getByLabelText("Repeat password"), "a long password");
    await fireEvent.changeText(screen.getByLabelText("Beta key"), "the-key");
    expect(screen.getByRole("checkbox", TICK).props.accessibilityState).toMatchObject({
      checked: false,
    });
    // Beside the box, and again in the legal links at the foot.
    // Beside the box, in the note under the other accounts, and again at the foot.
    expect(screen.getAllByRole("link", { name: "Terms of Service" })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })).toHaveLength(3);
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Agree to the terms to create an account")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
  });

  it("has no terms to agree to on a server of your own", async () => {
    const data = testData();
    data.serverUrl.set("https://sync.example.com");
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await screen.findByLabelText("Username");
    expect(screen.queryByRole("checkbox", TICK)).toBeNull();
  });

  it("asks for the password twice and refuses two that differ", async () => {
    const data = testData();
    const signUp = jest.spyOn(data.sync, "signUp").mockResolvedValue(ADA);
    data.serverUrl.set(PRODUCTION_SERVER);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.changeText(screen.getByLabelText("Repeat password"), "another long one");
    await fireEvent.changeText(screen.getByLabelText("Beta key"), "the-key");
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("The passwords don't match")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe("signing in with another account", () => {
  /// A server like Nookly's own: Google, GitHub and Notion, not yet Apple.
  function offering(data = testData()) {
    data.serverUrl.set(PRODUCTION_SERVER);
    jest.spyOn(data.sync, "providersOf").mockResolvedValue(["google", "github", "notion"]);
    return data;
  }

  it("offers the providers the server has, and says Apple is coming", async () => {
    const data = offering();
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in with Notion" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in with Apple" })).toBeDisabled();
    expect(screen.getByText("Apple is coming soon")).toBeTruthy();
  });

  it("opens the provider's sign in and carries on once the account is in", async () => {
    const data = offering();
    const signIn = jest.spyOn(data.sync, "signInWithProvider").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with GitHub" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        PRODUCTION_SERVER,
        "github",
        { createAccount: false, betaKey: undefined },
        {},
      ),
    );
    expect(data.onboarded.get()).toBe("1");
  });

  it("stays put when the sign in was closed without finishing", async () => {
    const data = offering();
    data.onboarded.set("");
    jest.spyOn(data.sync, "signInWithProvider").mockResolvedValue(null);
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with Google" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled(),
    );
    expect(data.onboarded.get()).toBe("");
  });

  it("says why it did not work", async () => {
    const data = offering();
    jest
      .spyOn(data.sync, "signInWithProvider")
      .mockRejectedValue(new Error("There is no Nookly account for this GitHub account yet."));
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with GitHub" }));
    expect(await screen.findByText(/no Nookly account for this GitHub/)).toBeTruthy();
  });

  it("creates an account with a provider only with the beta key typed first", async () => {
    const data = offering();
    data.serverUrl.set(PRODUCTION_SERVER);
    const signIn = jest.spyOn(data.sync, "signInWithProvider").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign up with Notion" })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign up with Notion" }));
    expect(await screen.findAllByText("Enter the beta key to create an account.")).not.toHaveLength(
      0,
    );
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Beta key"), " the-key ");
    await fireEvent.press(screen.getByRole("button", { name: "Sign up with Notion" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        PRODUCTION_SERVER,
        "notion",
        { createAccount: true, betaKey: "the-key" },
        {},
      ),
    );
  });

  it("points at the terms next to the buttons that create an account", async () => {
    const data = offering();
    data.serverUrl.set(PRODUCTION_SERVER);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    expect(await screen.findByText(/By signing up with another account you agree/)).toBeTruthy();
  });
});

describe("the second step of signing in", () => {
  async function toSecondStep(methods: ("totp" | "email" | "backup")[]) {
    const data = testData();
    jest
      .spyOn(data.sync, "signIn")
      .mockRejectedValue(new TwoFactorRequiredError("challenge-1", methods));
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    return { data, screen };
  }

  it("asks for the code of the authenticator app, and signs in with it", async () => {
    const { data, screen } = await toSecondStep(["totp", "email", "backup"]);
    const complete = jest.spyOn(data.sync, "completeTwoFactor").mockResolvedValue(ADA);
    await fireEvent.changeText(await screen.findByLabelText("Authenticator code"), "123 456");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith(
        "http://localhost:3000",
        "challenge-1",
        "totp",
        "123456",
        {},
      ),
    );
  });

  it("shows why the code was refused, and stays", async () => {
    const { data, screen } = await toSecondStep(["totp"]);
    jest
      .spyOn(data.sync, "completeTwoFactor")
      .mockRejectedValue(new Error("That code isn't right."));
    await fireEvent.changeText(await screen.findByLabelText("Authenticator code"), "000000");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("That code isn't right.")).toBeTruthy();
    expect(screen.getByLabelText("Authenticator code")).toBeTruthy();
  });

  it("emails a code when that is the choice, and takes a recovery code too", async () => {
    const { data, screen } = await toSecondStep(["email", "backup"]);
    const send = jest.spyOn(data.sync, "sendTwoFactorEmail").mockResolvedValue();
    expect(await screen.findByLabelText("Emailed code")).toBeTruthy();
    await waitFor(() => expect(send).toHaveBeenCalledWith("http://localhost:3000", "challenge-1"));
    await fireEvent.press(screen.getByRole("button", { name: "Use a recovery code" }));
    expect(await screen.findByLabelText("Recovery code")).toBeTruthy();
  });

  it("goes back to the password", async () => {
    const { screen } = await toSecondStep(["totp"]);
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText("Password")).toBeTruthy();
  });
});
