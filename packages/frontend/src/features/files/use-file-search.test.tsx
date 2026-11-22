import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { useFileSearch } from "./use-file-search";

function Probe({ text }: { text: string }) {
  const { ids } = useFileSearch("space-1", text);
  return <p>{ids === null ? "everything" : ids.join(",")}</p>;
}

beforeEach(() => {
  installTauriMock();
  mockCommand("search", [{ entityId: "f2" }, { entityId: "f1" }]);
});
afterEach(uninstallTauriMock);

describe("useFileSearch", () => {
  it("means every file while the text is empty", () => {
    renderWithProviders(<Probe text="  " />);
    expect(screen.getByText("everything")).toBeInTheDocument();
  });

  it("returns the ids of the hits, best match first, once typing pauses", async () => {
    renderWithProviders(<Probe text="fourier" />);
    expect(await screen.findByText("f2,f1")).toBeInTheDocument();
  });
});
