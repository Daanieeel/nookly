import { QueryObserver } from "@tanstack/react-query";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { describeError, ignoreError, installGlobalErrorLogging, logger } from "./log.ts";
import { createQueryClient } from "./query-client.ts";

const LineList = z.array(z.object({ level: z.string(), scope: z.string(), message: z.string() }));
type Line = z.infer<typeof LineList>[number];

function sent(): Line[] {
  return LineList.parse(callsOf("log_frontend"));
}

describe("logger", () => {
  it("sends the level, scope and message to the backend", async () => {
    mockCommand("log_frontend", null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("settings", "Couldn't save", new Error("disk full"));
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      level: "warn",
      scope: "settings",
      message: "Couldn't save: disk full",
    });
  });

  it("stays quiet when the backend cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => logger.error("x", "no backend mocked")).not.toThrow();
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
  });

  it("describes backend errors, errors and plain values", () => {
    expect(describeError({ kind: "NotFound", message: "task 1" })).toBe("NotFound: task 1");
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("text")).toBe("text");
    expect(describeError(42)).toBe("42");
  });
});

describe("ignoreError", () => {
  it("resolves to the fallback and leaves a debug line with the reason", async () => {
    mockCommand("log_frontend", null);
    const value = await Promise.reject(new Error("nope")).catch(
      ignoreError("reading the cache", null),
    );
    expect(value).toBeNull();
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toEqual({
      level: "debug",
      scope: "ignored",
      message: "reading the cache: nope",
    });
  });
});

describe("global error logging", () => {
  it("logs window errors and unhandled rejections until removed", async () => {
    mockCommand("log_frontend", null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const remove = installGlobalErrorLogging(window);
    window.dispatchEvent(
      new ErrorEvent("error", { message: "script broke", error: new Error("script broke") }),
    );
    const rejection = new Event("unhandledrejection");
    Object.assign(rejection, { reason: new Error("lost promise") });
    window.dispatchEvent(rejection);
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent().map((c) => c.message)).toEqual([
      "Uncaught error: script broke",
      "Unhandled promise rejection: lost promise",
    ]);
    remove();
    const swallow = (event: Event) => event.preventDefault();
    window.addEventListener("error", swallow);
    window.dispatchEvent(
      new ErrorEvent("error", { message: "after", error: new Error("after"), cancelable: true }),
    );
    window.removeEventListener("error", swallow);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent()).toHaveLength(2);
  });
});

describe("query client", () => {
  it("logs a failed query by name, without the rest of its key", async () => {
    mockCommand("log_frontend", null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createQueryClient();
    const observer = new QueryObserver(client, {
      queryKey: ["search", "private words"],
      queryFn: () => Promise.reject(new Error("db is busy")),
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    unsubscribe();
    const line = sent()[0];
    expect(line.level).toBe("error");
    expect(line.message).toBe("Loading search failed: db is busy");
    expect(line.message).not.toContain("private");
  });

  it("logs a failed mutation", async () => {
    mockCommand("log_frontend", null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = createQueryClient();
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new Error("read only")) })
      .execute(undefined)
      .catch(() => {});
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0].message).toBe("Saving a change failed: read only");
  });
});
