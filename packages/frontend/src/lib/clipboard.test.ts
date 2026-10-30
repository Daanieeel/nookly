import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { copyEntityLink } from "./clipboard.ts";

const jot = makeEntity({
  id: "66fd9c8e-3d3a-403a-b29d-89b2903c3c57",
  type: "jot",
  title: "Grundlagen der Informatik - Vorlesung, 29. Okt.",
  key: "JOT-12",
});

describe("copyEntityLink", () => {
  it("writes the mention as text with the readable key", async () => {
    mockCommand("plugin:clipboard-manager|write_html", null);
    await copyEntityLink(jot);
    const [call] = callsOf("plugin:clipboard-manager|write_html");
    expect(call).toMatchObject({
      altText: "[Grundlagen der Informatik - Vorlesung, 29. Okt.](mention:JOT-12)",
    });
  });

  it("keeps the block after the key", async () => {
    mockCommand("plugin:clipboard-manager|write_html", null);
    await copyEntityLink(jot, "955c5287-1f00");
    const [call] = callsOf("plugin:clipboard-manager|write_html");
    expect(call).toMatchObject({
      altText: "[Grundlagen der Informatik - Vorlesung, 29. Okt.](mention:JOT-12#955c5287-1f00)",
    });
  });

  it("keeps the id in the rich copy, so pasting into a note links the right page", async () => {
    mockCommand("plugin:clipboard-manager|write_html", null);
    await copyEntityLink(jot, "blk_1");
    const [call] = callsOf("plugin:clipboard-manager|write_html");
    expect(call).toMatchObject({ html: expect.stringContaining(`href="mention:${jot.id}#blk_1"`) });
  });
});
