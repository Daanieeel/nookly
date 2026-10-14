import { ApiClient, type Share } from "@nookly/shared/api";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { ShareDialog } from "./ShareDialog.tsx";
import { syncRuntime } from "./sync-instance.ts";

const page = makeEntity({ id: "p1", type: "note", title: "Trip plan" });

function share(overrides: Partial<Share> = {}): Share {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    entityId: "p1",
    entityType: "note",
    title: "Trip plan",
    role: "viewer",
    status: "accepted",
    owner: "ada",
    recipient: "ben@example.com",
    createdAt: "2026-10-14T00:00:00Z",
    ...overrides,
  };
}

function fakeAccount(shares: Share[]) {
  const api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  vi.spyOn(api, "sharesByMe").mockImplementation(async () => shares);
  vi.spyOn(api, "share").mockImplementation(async (_entityId, email, role) => {
    const created = share({
      id: "00000000-0000-4000-8000-000000000002",
      recipient: email,
      role,
      status: "pending",
    });
    shares.push(created);
    return { share: created, inviteUrl: "https://sync.example.com/invite?token=abc" };
  });
  vi.spyOn(api, "changeShareRole").mockResolvedValue();
  vi.spyOn(api, "removeShare").mockResolvedValue();
  vi.spyOn(syncRuntime, "account").mockReturnValue(api);
  return api;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sharing a page with people", () => {
  it("lists who has access and invites someone new", async () => {
    const api = fakeAccount([share()]);
    const { user } = renderWithProviders(
      <ShareDialog entity={page} open onOpenChange={() => {}} />,
    );
    expect(await screen.findByText("ben@example.com")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Email/), "cleo@example.com");
    const access = screen.getByRole("radiogroup", { name: "Access for the person you invite" });
    await user.click(within(access).getByRole("radio", { name: "Can edit" }));
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(api.share).toHaveBeenCalledWith("p1", "cleo@example.com", "editor"));
    const row = (await screen.findByText("cleo@example.com")).closest("li");
    if (!row) throw new Error("no row");
    expect(within(row).getByText("Invited")).toBeInTheDocument();
  });

  it("asks for a real address", async () => {
    const api = fakeAccount([]);
    const { user } = renderWithProviders(
      <ShareDialog entity={page} open onOpenChange={() => {}} />,
    );
    await user.type(screen.getByLabelText(/Email/), "not an email");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Enter an email address")).toBeInTheDocument();
    expect(api.share).not.toHaveBeenCalled();
  });

  it("removes someone's access", async () => {
    const api = fakeAccount([share()]);
    const { user } = renderWithProviders(
      <ShareDialog entity={page} open onOpenChange={() => {}} />,
    );
    const row = (await screen.findByText("ben@example.com")).closest("li");
    if (!row) throw new Error("no row");
    await user.click(within(row).getByRole("button", { name: "Remove Access" }));
    await waitFor(() => expect(api.removeShare).toHaveBeenCalledWith(share().id));
  });

  it("has no axe violations", async () => {
    fakeAccount([
      share(),
      share({
        id: "00000000-0000-4000-8000-000000000003",
        recipient: "dan@example.com",
        status: "pending",
      }),
    ]);
    renderWithProviders(<ShareDialog entity={page} open onOpenChange={() => {}} />);
    await screen.findByText("dan@example.com");
    await expectNoA11yViolations();
  });
});
