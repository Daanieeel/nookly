import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const githubAnswer = {
  tag_name: "v1.0.0",
  published_at: "2026-11-23T22:15:30Z",
  html_url: "https://github.com/x/releases/tag/v1.0.0",
  assets: [],
};

describe("useRelease", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it("starts without a version, as the static page has none, then shows the latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(githubAnswer)),
    );
    const { useRelease } = await import("./use-release");
    const { result } = renderHook(() => useRelease());
    expect(result.current.version).toBeNull();
    await waitFor(() => expect(result.current.version).toBe("1.0.0"));
  });

  it("shares one request between every button on the page", async () => {
    const fetchMock = vi.fn(async () => Response.json(githubAnswer));
    vi.stubGlobal("fetch", fetchMock);
    const { useRelease } = await import("./use-release");
    const first = renderHook(() => useRelease());
    const second = renderHook(() => useRelease());
    await waitFor(() => expect(first.result.current.version).toBe("1.0.0"));
    await waitFor(() => expect(second.result.current.version).toBe("1.0.0"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
