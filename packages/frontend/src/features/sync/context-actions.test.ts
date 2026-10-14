import { describe, expect, it } from "vitest";
import { actionsFor } from "#/components/context-menu/registry.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { syncRuntime } from "./sync-instance.ts";
import "./context-actions.tsx";

const shareAction = () => {
  const action = actionsFor("entity").find((a) => a.id === "share-with-people");
  if (!action?.when) throw new Error("share-with-people is not registered");
  return action.when;
};

const ADA = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "a@b.co",
  emailVerified: true,
  createdAt: "",
};

describe("Share with People", () => {
  it("shows on pages and tasks only while signed in to sync", () => {
    const when = shareAction();
    const page = makeEntity({ type: "note", spaceId: "s1" });
    expect(when({ entity: page })).toBe(false);
    syncRuntime.store.setState({ user: ADA });
    expect(when({ entity: page })).toBe(true);
    expect(when({ entity: makeEntity({ type: "task", spaceId: "s1" }) })).toBe(true);
    expect(when({ entity: makeEntity({ type: "bookmark", spaceId: "s1" }) })).toBe(false);
    syncRuntime.store.setState({ user: null });
  });

  it("never shows on a page someone shared with you", () => {
    syncRuntime.store.setState({ user: ADA });
    expect(shareAction()({ entity: makeEntity({ type: "note", spaceId: "shared-owner" }) })).toBe(
      false,
    );
    syncRuntime.store.setState({ user: null });
  });
});
