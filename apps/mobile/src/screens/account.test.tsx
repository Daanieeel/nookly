import {
  ApiRequestError,
  PRODUCTION_SERVER,
  ProviderNoAccountError,
  TERMS_VERSION,
  TwoFactorRequiredError,
} from "@nookly/shared/api";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { Keyboard, StyleSheet, TextInput } from "react-native";
import { TINT } from "../ui/tokens.ts";
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
  it("reads like the desktop's dialog: a short title and line, the two tabs, and a quiet forgotten password", async () => {
    // One page: there is no other route to go to, the tab changes what the page shows.
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    expect(await screen.findByRole("header", { name: "Sign in to Nookly" })).toBeTruthy();
    expect(screen.getByText("Pick up where you left off, the same on every device.")).toBeTruthy();
    expect(screen.getByText("Closed beta")).toBeTruthy();
    // The same two tabs; the one for signing in is chosen.
    expect(screen.getByRole("radio", { name: "I have an account", checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "I'm new here", checked: false })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Forgot Password" })).toBeTruthy();
    // No long welcome, and no separate invitation under the form: the tab is the way across.
    expect(screen.queryByText(/Your Spaces, pages and files/)).toBeNull();
    expect(screen.queryByText("New to Nookly?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();
    // The test server has no providers: all four are there, none works.
    for (const provider of ["Google", "Apple", "GitHub", "Notion"]) {
      expect(screen.getByRole("button", { name: `Sign in with ${provider}` })).toBeDisabled();
    }
    await fireEvent.press(screen.getByRole("radio", { name: "I'm new here" }));
    expect(await screen.findByRole("header", { name: "Create your account" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "I'm new here", checked: true })).toBeTruthy();
    // Nothing listing what an account gives: that is for the welcome page's own words.
    expect(screen.queryByText("Live on your computer, phone and tablet")).toBeNull();
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

  it("asks what happens to what is on this phone in a second step, and signs in with the answer", async () => {
    const data = testData();
    jest.spyOn(data.sync, "localDataCount").mockResolvedValue(12);
    const signIn = jest.spyOn(data.sync, "signIn").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    // The question is not on the form: it comes as a step of its own.
    expect(screen.queryByText(/This iPhone already holds 12 items/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText(/This iPhone already holds 12 items/)).toBeTruthy();
    expect(screen.queryByLabelText("Username or email")).toBeNull();
    // Nothing joins an account, and nothing is cleared, without an answer.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("radio", { name: "Keep out of the account" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        expect.stringMatching(/^http/),
        "ada",
        "a long password",
        { localData: "setAside" },
      ),
    );
  });

  it("goes back from the second step to the form, with what was typed still there", async () => {
    const data = testData();
    jest.spyOn(data.sync, "localDataCount").mockResolvedValue(3);
    const signIn = jest.spyOn(data.sync, "signIn").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText(/This iPhone already holds 3 items/);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText("Username or email")).toBeTruthy();
    expect(screen.getByLabelText("Username or email").props.value).toBe("ada");
    expect(screen.queryByText(/already holds/)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps the server tucked away until asked for", async () => {
    const screen = await renderScreens({ index: () => <SignInScreen /> });
    expect(screen.queryByLabelText("Server")).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "Change Server" }));
    expect(screen.getByLabelText("Server")).toBeTruthy();
    // Nothing to revert while it is the address the page opened with.
    expect(screen.queryByRole("button", { name: "Revert Server" })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Server"), "sync.example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Revert Server" }));
    expect(screen.queryByLabelText("Server")).toBeNull();
    expect(screen.getByRole("button", { name: "Change Server" })).toBeTruthy();
  });
});

describe("creating an account", () => {
  async function fillIn(
    screen: Awaited<ReturnType<typeof renderScreens>>,
    repeat = "a long password",
  ) {
    await fireEvent.changeText(await screen.findByLabelText("Username"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.changeText(screen.getByLabelText("Repeat password"), repeat);
    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
  }

  it("needs a username, an email and a long enough password", async () => {
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
    await fillIn(screen);
    await fireEvent.changeText(screen.getByLabelText("Username"), "ada");
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    // More follows, as on the desktop: the beta key and the terms are the next step.
    expect(await screen.findByLabelText("Beta key")).toBeTruthy();
    expect(screen.queryByLabelText("Username")).toBeNull();
    expect(signUp).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Beta key"), " the-key ");
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        PRODUCTION_SERVER,
        {
          username: "ada",
          email: "ada@example.com",
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
    for (const name of ["Username", "Email", "Password"]) {
      // The drawn name, which may carry a star for a required field.
      expect(screen.getByText(new RegExp(`^${name}( \\*)?$`))).toBeTruthy();
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    // The beta key and the terms are not on the form: they are the next step.
    expect(screen.queryByLabelText("Beta key")).toBeNull();
    expect(screen.queryByRole("checkbox", TICK)).toBeNull();
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

  it("will not create an account until the key is typed and the terms agreed to, and links the texts", async () => {
    const data = testData();
    const signUp = jest.spyOn(data.sync, "signUp").mockResolvedValue(ADA);
    data.serverUrl.set(PRODUCTION_SERVER);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fillIn(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByLabelText("Beta key");
    const proceed = () => screen.getByRole("button", { name: "Continue" });
    expect(screen.getByRole("checkbox", TICK).props.accessibilityState).toMatchObject({
      checked: false,
    });
    // Beside the box, and again in the legal links at the foot.
    expect(screen.getAllByRole("link", { name: "Terms of Service" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })).toHaveLength(2);
    expect(proceed()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Beta key"), "the-key");
    // The terms are still missing.
    expect(proceed()).toBeDisabled();
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    expect(proceed()).toBeEnabled();
    expect(signUp).not.toHaveBeenCalled();
    await fireEvent.press(proceed());
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
  });

  it("goes back from the second step to the form, and says what the server turned down", async () => {
    const data = testData();
    data.serverUrl.set(PRODUCTION_SERVER);
    jest.spyOn(data.sync, "signUp").mockRejectedValue(new Error("That beta key isn't right."));
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fillIn(screen);
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    expect((await screen.findByLabelText("Username")).props.value).toBe("ada");
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    await fireEvent.changeText(await screen.findByLabelText("Beta key"), "wrong");
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("That beta key isn't right.")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
  });

  it("goes straight through on a server of your own: no key, no terms", async () => {
    const data = testData();
    const signUp = jest.spyOn(data.sync, "signUp").mockResolvedValue(ADA);
    data.serverUrl.set("https://sync.example.com");
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fillIn(screen);
    expect(screen.queryByRole("checkbox", TICK)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
  });

  it("asks for the password twice and refuses two that differ", async () => {
    const data = testData();
    const signUp = jest.spyOn(data.sync, "signUp").mockResolvedValue(ADA);
    data.serverUrl.set(PRODUCTION_SERVER);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await fillIn(screen, "another long one");
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("The passwords don't match")).toBeTruthy();
    expect(screen.queryByLabelText("Beta key")).toBeNull();
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
    // Like the desktop's row: only the marks, drawn as the app's secondary buttons, named for
    // a screen reader.
    for (const name of ["Google", "GitHub", "Notion"]) expect(screen.queryByText(name)).toBeNull();
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

  it.each([
    ["in", () => <SignInScreen />],
    ["up", () => <SignUpScreen />],
  ] as const)("asks for the second step after signing %s with a provider", async (verb, page) => {
    const data = offering();
    jest
      .spyOn(data.sync, "signInWithProvider")
      .mockRejectedValue(new TwoFactorRequiredError("challenge-2", ["totp"]));
    const complete = jest.spyOn(data.sync, "completeTwoFactor").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: page }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: `Sign ${verb} with GitHub` })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: `Sign ${verb} with GitHub` }));
    if (verb === "up") {
      await fireEvent.changeText(await screen.findByLabelText("Beta key"), "the-key");
      await fireEvent.press(screen.getByRole("checkbox", TICK));
      await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    }
    await fireEvent.changeText(await screen.findByLabelText("Authenticator code"), "123456");
    await waitFor(() =>
      expect(complete).toHaveBeenCalledWith(PRODUCTION_SERVER, "challenge-2", "totp", "123456", {}),
    );
    await waitFor(() => expect(data.onboarded.get()).toBe("1"));
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

  it("creates an account with a provider only with the beta key typed and the terms agreed to", async () => {
    const data = offering();
    const signIn = jest.spyOn(data.sync, "signInWithProvider").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignUpScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign up with Notion" })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign up with Notion" }));
    // Not tied to what was typed above: the beta key and the terms are the next step.
    const proceed = () => screen.getByRole("button", { name: "Continue" });
    await fireEvent.changeText(await screen.findByLabelText("Beta key"), " the-key ");
    expect(proceed()).toBeDisabled();
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    await fireEvent.press(proceed());
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        PRODUCTION_SERVER,
        "notion",
        { createAccount: true, betaKey: "the-key", termsVersion: TERMS_VERSION },
        {},
      ),
    );
  });

  it("turns a sign in with a provider that has no account into a sign up", async () => {
    const data = offering();
    const signIn = jest
      .spyOn(data.sync, "signInWithProvider")
      .mockRejectedValueOnce(new ProviderNoAccountError("notion"))
      .mockResolvedValueOnce(ADA);
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in with Notion" })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with Notion" }));
    expect(
      await screen.findByText(
        "There is no Nookly account for this Notion account yet. Create one?",
      ),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Beta key"), "the-key");
    await fireEvent.press(screen.getByRole("checkbox", TICK));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenLastCalledWith(
        PRODUCTION_SERVER,
        "notion",
        { createAccount: true, betaKey: "the-key", termsVersion: TERMS_VERSION },
        {},
      ),
    );
  });

  it("asks what happens to what is on the phone before a provider sign in", async () => {
    const data = offering();
    jest.spyOn(data.sync, "localDataCount").mockResolvedValue(4);
    const signIn = jest.spyOn(data.sync, "signInWithProvider").mockResolvedValue(ADA);
    const screen = await renderScreens({ index: () => <SignInScreen /> }, data);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Sign in with GitHub" }));
    expect(await screen.findByText(/This iPhone already holds 4 items/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Add to the account" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        PRODUCTION_SERVER,
        "github",
        { createAccount: false, betaKey: undefined, termsVersion: undefined },
        { localData: "add" },
      ),
    );
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
    // Six boxes; the last digit signs in.
    await screen.findByLabelText("Authenticator code");
    expect(screen.getAllByTestId(/^otp-box-/)).toHaveLength(6);
    await fireEvent.changeText(screen.getByLabelText("Authenticator code"), "123 456");
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

  it("opens the keyboard on the code and marks it a one time code, so iOS suggests it", async () => {
    const { screen } = await toSecondStep(["totp", "backup"]);
    const input = await screen.findByLabelText("Authenticator code");
    expect(input.props.autoFocus).toBe(true);
    expect(input.props.textContentType).toBe("oneTimeCode");
    expect(input.props.autoComplete).toBe("one-time-code");
    await fireEvent.press(screen.getByRole("button", { name: "Use a recovery code" }));
    expect((await screen.findByLabelText("Recovery code")).props.autoFocus).toBe(true);
  });

  it("turns the boxes red and empties them when the code is wrong, with no sentence", async () => {
    const { data, screen } = await toSecondStep(["totp"]);
    jest
      .spyOn(data.sync, "completeTwoFactor")
      .mockRejectedValue(new ApiRequestError(401, "invalid_code", "That code isn't right."));
    await fireEvent.changeText(await screen.findByLabelText("Authenticator code"), "000000");
    await waitFor(() => expect(screen.getByTestId("otp-box-0").props.style).toBeTruthy());
    await waitFor(() =>
      expect(StyleSheet.flatten(screen.getByTestId("otp-box-0").props.style).borderColor).toBe(
        TINT.red.light,
      ),
    );
    expect(screen.queryByText("That code isn't right.")).toBeNull();
    expect(screen.getByTestId("otp-box-0")).toHaveTextContent("");
    // Typing again calms them.
    await fireEvent.changeText(screen.getByLabelText("Authenticator code"), "1");
    await waitFor(() =>
      expect(StyleSheet.flatten(screen.getByTestId("otp-box-0").props.style).borderColor).not.toBe(
        TINT.red.light,
      ),
    );
  });

  it("says why anything else went wrong, and stays", async () => {
    const { data, screen } = await toSecondStep(["totp"]);
    jest
      .spyOn(data.sync, "completeTwoFactor")
      .mockRejectedValue(new ApiRequestError(429, "rate_limited", "Too many requests."));
    await fireEvent.changeText(await screen.findByLabelText("Authenticator code"), "000000");
    expect(await screen.findByText("Too many requests.")).toBeTruthy();
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
