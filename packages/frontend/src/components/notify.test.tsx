import { act, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { AppToaster } from "./app-toaster.tsx";
import { notify } from "./notify.tsx";

const note = makeEntity({ id: "note-9", spaceId: "space-1", type: "note", title: "Physics" });

describe("notify", () => {
  beforeEach(() => {
    window.matchMedia = (media) => ({
      matches: false,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
    mockCommand("touch_entity_opened", null);
    useNavStore.setState({ view: { kind: "dashboard" } });
    toast.dismiss();
  });

  it.each(["success", "error", "warning", "info"] as const)(
    "puts the %s icon on the same line as the message",
    async (kind) => {
      renderWithProviders(<AppToaster />);
      act(() => void notify[kind]("Something happened"));
      const message = await screen.findByText("Something happened");
      expect(message.querySelector("svg")).not.toBeNull();
    },
  );

  it("draws no icon of its own besides the one in the message line", async () => {
    const { container } = renderWithProviders(<AppToaster />);
    act(() => void notify.success("Saved"));
    await screen.findByText("Saved");
    expect(document.querySelector("[data-icon]")).toBeNull();
    expect(container).toBeDefined();
  });

  it("shows an item as a link that opens it", async () => {
    const { user } = renderWithProviders(<AppToaster />);
    act(() => void notify.success("Imported", { entity: note }));
    const link = await screen.findByRole("button", { name: "Open Physics" });
    expect(link).toHaveTextContent("Physics");
    await user.click(link);
    expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "note-9" });
  });

  it("shows a description under the message", async () => {
    renderWithProviders(<AppToaster />);
    act(() => void notify.error("Couldn't save changes", { description: "Try again later." }));
    expect(await screen.findByText("Try again later.")).toBeInTheDocument();
  });

  it("runs an action, such as Undo", async () => {
    let undone = false;
    const { user } = renderWithProviders(<AppToaster />);
    act(
      () =>
        void notify.success("Entry moved to Trash", {
          action: {
            label: "Undo",
            onClick: () => {
              undone = true;
            },
          },
        }),
    );
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(undone).toBe(true);
  });

  it("dismisses one toast or all of them", async () => {
    renderWithProviders(<AppToaster />);
    let id: string | number = "";
    act(() => {
      id = notify.info("First");
      notify.info("Second");
    });
    await screen.findByText("Second");
    act(() => notify.dismiss(id));
    await waitFor(() => expect(screen.queryByText("First")).toBeNull());
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it.each(["success", "warning"] as const)(
    "closes a %s by itself after a few seconds",
    async (kind) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderWithProviders(<AppToaster />);
        act(() => void notify[kind]("Goes away"));
        await screen.findByText("Goes away");
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10_000);
        });
        await waitFor(() => expect(screen.queryByText("Goes away")).toBeNull());
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("keeps an error until it is closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithProviders(<AppToaster />);
      act(() => void notify.error("Stays"));
      await screen.findByText("Stays");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByText("Stays")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces a failure as an alert and anything else as a status", async () => {
    renderWithProviders(<AppToaster />);
    act(() => {
      notify.error("Couldn't save");
      notify.success("Saved");
    });
    expect((await screen.findByText("Couldn't save")).closest("[role]")).toHaveAttribute(
      "role",
      "alert",
    );
    expect((await screen.findByText("Saved")).closest("[role]")).toHaveAttribute("role", "status");
  });
});
