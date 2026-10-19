import { QueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { entityRegistrationFor } from "#/components/context-menu/registry.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import "#/features/notes/context-actions.tsx";

describe("the right click Export of a page", () => {
  it.each(["note", "jot"])("opens the Export dialog for a %s", async (type) => {
    const action = entityRegistrationFor(type)?.actions?.find((a) => a.id === "export-page");
    if (!action?.run) throw new Error("the export action is not registered");
    expect(action.label).toBe("Export…");
    // Markdown files are saved from the Export dialog now.
    expect(entityRegistrationFor(type)?.actions?.some((a) => a.id === "save-markdown")).toBe(false);

    let dialog: ReactNode = null;
    await action.run(
      { entity: makeEntity({ id: "n1", type, title: "Physics" }) },
      {
        queryClient: new QueryClient(),
        close: () => {},
        refresh: async () => {},
        openPopover: () => {},
        openDialog: (render) => {
          dialog = render(() => {});
        },
      },
    );
    renderWithProviders(<>{dialog}</>);
    expect(await screen.findByRole("dialog", { name: "Export Page" })).toBeInTheDocument();
  });
});
