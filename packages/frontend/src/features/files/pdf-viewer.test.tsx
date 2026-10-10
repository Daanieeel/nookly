import { act, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "#/components/error-boundary.tsx";
import { renderWithProviders } from "#/test/render.tsx";
import { type PdfDocumentProps, PdfViewer } from "./pdf-viewer.tsx";

/// How many more times the mocked pdf.js fails to open the file before it succeeds,
/// like an iCloud file that is not downloaded yet.
interface FirstPage {
  getViewport: () => { width: number; height: number };
}

interface Loads {
  failures: number;
  /// When set, the first page's size arrives when this resolves, not at once.
  firstPage: Promise<FirstPage> | null;
}

const loads: Loads = { failures: 0, firstPage: null };

/// The document pdf.js hands the viewer once a file has loaded.
type PdfDocument = Parameters<PdfDocumentProps["onLoadSuccess"]>[0];

/// Stands in for react-pdf's loader: it opens the file or reports an error, nothing else.
function FakeDocument({ onLoadSuccess, onLoadError, error, children }: PdfDocumentProps) {
  // Decided once per mount, like pdf.js does per load.
  const [failing] = useState(() => loads.failures > 0);
  useEffect(() => {
    if (failing) {
      loads.failures -= 1;
      onLoadError(new Error("file not available"));
      return;
    }
    // SAFETY: the viewer only reads `numPages` and the first page's viewport.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a stub of pdf.js's document proxy, cast through unknown
    onLoadSuccess({
      numPages: 2,
      getPage: () =>
        loads.firstPage ?? Promise.resolve({ getViewport: () => ({ width: 100, height: 100 }) }),
    } as unknown as PdfDocument);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one load per mount, like pdf.js
  }, []);
  return failing ? error : <div>{children}</div>;
}

const viewer = (props: { initialPage?: number; onInitialPageShown?: () => void } = {}) => (
  <PdfViewer src="asset://a.pdf" name="a.pdf" documentComponent={FakeDocument} {...props} />
);

beforeEach(() => {
  loads.failures = 0;
  loads.firstPage = null;
  // jsdom has none; pages never count as near the viewport, which is all these tests need.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("PdfViewer load errors", () => {
  it("shows the error with a Try Again button", async () => {
    loads.failures = 1;
    renderWithProviders(viewer());
    expect(await screen.findByText(/Couldn't load a\.pdf/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
  });

  it("loads the pages once the file is available and Try Again is clicked", async () => {
    loads.failures = 1;
    const { user } = renderWithProviders(viewer());
    await user.click(await screen.findByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(screen.queryByText(/Couldn't load/)).toBeNull());
    expect(screen.getByText("/ 2")).toBeTruthy();
  });

  it("tries again by itself when the window regains focus", async () => {
    loads.failures = 1;
    renderWithProviders(viewer());
    await screen.findByText(/Couldn't load/);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(screen.queryByText(/Couldn't load/)).toBeNull());
  });
});

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("shows the fallback for a crashed child and leaves its siblings mounted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(
      <div>
        <p>sibling</p>
        <ErrorBoundary fallback={(reset) => <button onClick={reset}>Try Again</button>}>
          <Bomb />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText("sibling")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Try Again" })).toBeTruthy();
  });
});

describe("PdfViewer opening on a page", () => {
  it("goes to the requested page once the document has loaded, then hands the request back", async () => {
    const shown = vi.fn();
    renderWithProviders(viewer({ initialPage: 2, onInitialPageShown: shown }));
    await waitFor(() => expect(shown).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("2")).toBeTruthy();
  });

  it("waits for the document while it fails to load, and still goes there after a retry", async () => {
    loads.failures = 1;
    const shown = vi.fn();
    const { user } = renderWithProviders(viewer({ initialPage: 2, onInitialPageShown: shown }));
    await screen.findByRole("button", { name: "Try Again" });
    expect(shown).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(shown).toHaveBeenCalledTimes(1));
  });

  it("stays on the first page without a request", async () => {
    const shown = vi.fn();
    renderWithProviders(viewer({ onInitialPageShown: shown }));
    await screen.findByText("/ 2");
    expect(shown).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("1")).toBeTruthy();
  });
});

describe("PdfViewer landing on the right page", () => {
  /// What the page's own scroll call was asked, for the page div it is called on.
  function scrolls() {
    const spy = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    Element.prototype.scrollIntoView = function scrollIntoView(arg) {
      if (this instanceof HTMLElement && this.dataset.page) spy(arg);
    };
    return spy;
  }

  it("does not scroll before the first page has been measured, so placeholder sizes cannot throw it off", async () => {
    const spy = scrolls();
    let measured: (page: FirstPage) => void = () => {};
    loads.firstPage = new Promise((resolve) => {
      measured = resolve;
    });
    const shown = vi.fn();
    renderWithProviders(viewer({ initialPage: 2, onInitialPageShown: shown }));
    await screen.findByText("/ 2");
    expect(spy).not.toHaveBeenCalled();
    expect(shown).not.toHaveBeenCalled();
    await act(async () => measured({ getViewport: () => ({ width: 100, height: 56 }) }));
    await waitFor(() => expect(shown).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalled();
  });

  it("jumps at once rather than smoothly, which a layout change would catch mid flight", async () => {
    const spy = scrolls();
    const shown = vi.fn();
    renderWithProviders(viewer({ initialPage: 2, onInitialPageShown: shown }));
    await waitFor(() => expect(shown).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith({ block: "start" });
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("keeps the page in place while the layout settles, until the user scrolls", async () => {
    const spy = scrolls();
    const resized: Array<() => void> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const shown = vi.fn();
    const { container } = renderWithProviders(
      viewer({ initialPage: 2, onInitialPageShown: shown }),
    );
    await waitFor(() => expect(shown).toHaveBeenCalledTimes(1));
    const before = spy.mock.calls.length;
    // Pages measured above it change its height: the page is put back at the top.
    act(() => resized.forEach((callback) => callback()));
    expect(spy.mock.calls.length).toBeGreaterThan(before);

    // Once the user takes over, the viewer stops moving the page.
    const root = container.querySelector(".overflow-auto");
    if (!(root instanceof HTMLElement)) throw new Error("the scroll area is missing");
    act(() => {
      root.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    });
    const settled = spy.mock.calls.length;
    act(() => resized.forEach((callback) => callback()));
    expect(spy.mock.calls.length).toBe(settled);
  });
});
