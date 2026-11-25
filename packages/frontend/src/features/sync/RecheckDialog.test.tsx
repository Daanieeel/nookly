import { ApiClient, ApiRequestError, type SignInSummary } from "@nookly/shared/api";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { RecheckDialog } from "./RecheckDialog.tsx";
import { recheck } from "./recheck-gate.ts";
import { syncRuntime } from "./sync-instance.ts";

function summary(providers: string[], secondStep: SignInSummary["secondStep"] = []) {
  return {
    methods: providers.map((provider, index) => ({
      provider,
      email: "ada@example.com",
      emailVerified: true,
      primary: index === 0,
      canBePrimary: index > 0,
    })),
    current: providers[0] ?? null,
    fresh: false,
    secondStep,
    offered: ["github"],
  } satisfies SignInSummary;
}

let api: ApiClient;

beforeEach(() => {
  api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  vi.spyOn(syncRuntime, "account").mockReturnValue(api);
});

afterEach(() => {
  act(() => recheck.finish(false));
  vi.restoreAllMocks();
});

/// Opens the question the way a refused change does, and gives its outcome.
function ask() {
  let outcome: string | null = null;
  let confirmed = false;
  void recheck
    .run(async () => {
      if (!confirmed) throw new ApiRequestError(403, "recheck_required", "Confirm it's you.");
      return "changed";
    })
    .then(
      (value) => {
        outcome = value;
      },
      (error: Error) => {
        outcome = error.name;
      },
    );
  return {
    outcome: () => outcome,
    allow: () => {
      confirmed = true;
    },
  };
}

describe("confirming it is you", () => {
  it("takes the password, and the change goes through", async () => {
    vi.spyOn(api, "signInMethods").mockResolvedValue(summary(["credential"]));
    const { user } = renderWithProviders(<RecheckDialog />);
    let change: ReturnType<typeof ask> | null = null;
    act(() => {
      change = ask();
    });
    const check = vi.spyOn(api, "recheck").mockImplementation(async () => change?.allow());
    expect(await screen.findByRole("dialog", { name: "Confirm it's you" })).toBeVisible();
    await user.type(await screen.findByLabelText(/^Password/), "a long password");
    await expectNoA11yViolations();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(check).toHaveBeenCalledWith({ password: "a long password" });
    await waitFor(() => expect(change?.outcome()).toBe("changed"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("goes on to a code when the account has two-factor", async () => {
    vi.spyOn(api, "signInMethods").mockResolvedValue(summary(["credential"], ["totp"]));
    const { user } = renderWithProviders(<RecheckDialog />);
    let change: ReturnType<typeof ask> | null = null;
    act(() => {
      change = ask();
    });
    const check = vi.spyOn(api, "recheck").mockImplementation(async (input) => {
      if (!input.code) throw new ApiRequestError(403, "second_step_required", "Enter a code.");
      change?.allow();
    });
    await user.type(await screen.findByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Authenticator code"), "123456");
    await waitFor(() =>
      expect(check).toHaveBeenLastCalledWith({
        password: "a long password",
        method: "totp",
        code: "123456",
      }),
    );
    await waitFor(() => expect(change?.outcome()).toBe("changed"));
  });

  it("emails the code when that is the second step", async () => {
    vi.spyOn(api, "signInMethods").mockResolvedValue(summary(["credential"], ["email"]));
    vi.spyOn(api, "recheck").mockRejectedValue(
      new ApiRequestError(403, "second_step_required", "Enter a code."),
    );
    const send = vi.spyOn(api, "sendRecheckCode").mockResolvedValue();
    const { user } = renderWithProviders(<RecheckDialog />);
    act(() => {
      ask();
    });
    await user.type(await screen.findByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Emailed code")).toBeVisible();
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    await expectNoA11yViolations();
  });

  it("confirms through a provider, for an account without a password", async () => {
    vi.spyOn(api, "signInMethods").mockResolvedValue(summary(["github"]));
    const browser = vi.spyOn(syncRuntime, "confirmWithProvider").mockResolvedValue(true);
    const { user } = renderWithProviders(<RecheckDialog />);
    let change: ReturnType<typeof ask> | null = null;
    act(() => {
      change = ask();
    });
    const check = vi.spyOn(api, "recheck").mockImplementation(async () => change?.allow());
    const button = await screen.findByRole("button", { name: "Continue with GitHub" });
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    await user.click(button);
    expect(browser).toHaveBeenCalledWith("github");
    expect(check).toHaveBeenCalledWith({});
    await waitFor(() => expect(change?.outcome()).toBe("changed"));
  });

  it("stays open when the browser is closed, and says why a password is wrong", async () => {
    vi.spyOn(api, "signInMethods").mockResolvedValue(summary(["credential", "github"]));
    vi.spyOn(syncRuntime, "confirmWithProvider").mockResolvedValue(false);
    const check = vi
      .spyOn(api, "recheck")
      .mockRejectedValue(new ApiRequestError(403, "wrong_password", "The password is wrong."));
    const { user } = renderWithProviders(<RecheckDialog />);
    act(() => {
      ask();
    });
    await user.click(await screen.findByRole("button", { name: "Continue with GitHub" }));
    expect(check).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Password/), "no");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("The password is wrong.")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("drops the change when closed", async () => {
    vi.spyOn(api, "signInMethods").mockResolvedValue(summary(["credential"]));
    const { user } = renderWithProviders(<RecheckDialog />);
    let change: ReturnType<typeof ask> | null = null;
    act(() => {
      change = ask();
    });
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(change?.outcome()).toBe("RecheckCancelled"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
