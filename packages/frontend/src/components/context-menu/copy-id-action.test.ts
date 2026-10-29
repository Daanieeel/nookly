import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { actionsFor } from "./registry.ts";
import "./entity-actions.tsx";

describe("the right click Copy ID", () => {
  it("sits directly below Copy Mention", () => {
    const ids = actionsFor("entity").map((a) => a.id);
    expect(ids.indexOf("copy-id")).toBe(ids.indexOf("copy-link") + 1);
  });

  it("copies the readable ID, not the internal one", async () => {
    mockCommand("plugin:clipboard-manager|write_text", null);
    const action = actionsFor("entity").find((a) => a.id === "copy-id");
    if (!action?.run) throw new Error("copy-id is not registered");
    expect(action.group).toBe("share");
    await action.run(
      { entity: makeEntity({ id: "abc-123", key: "TSK-12" }) },
      {
        queryClient: new QueryClient(),
        close: () => {},
        refresh: async () => {},
        openPopover: () => {},
        openDialog: () => {},
      },
    );
    expect(callsOf("plugin:clipboard-manager|write_text")[0]).toMatchObject({ text: "TSK-12" });
  });
});
