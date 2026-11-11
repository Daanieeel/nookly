import { render, screen } from "@testing-library/react";
import { type ComponentProps, isValidElement, useEffect } from "react";
import type { Document, Page } from "react-pdf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPreview } from "./export-preview.tsx";

const suspenseSeen: (boolean | undefined)[] = [];

/// Stands in for react-pdf: opens every file as two pages and records whether it was asked
/// to suspend.
function FakeDocument({ suspense, onLoadSuccess, children }: ComponentProps<typeof Document>) {
  suspenseSeen.push(suspense);
  useEffect(() => {
    // SAFETY: the preview only reads `numPages` from the loaded document.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a stub of pdf.js's document proxy, cast through unknown
    onLoadSuccess?.({ numPages: 2 } as unknown as Parameters<
      NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>
    >[0]);
  }, [onLoadSuccess]);
  return <div>{isValidElement(children) ? children : null}</div>;
}

function FakePage({ suspense, pageNumber }: ComponentProps<typeof Page>) {
  suspenseSeen.push(suspense);
  return <div>Page {pageNumber}</div>;
}

beforeEach(() => {
  suspenseSeen.length = 0;
  // jsdom lays nothing out; the preview pane is 500px wide.
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        // SAFETY: the preview only reads `contentRect.width` from the entry.
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a minimal ResizeObserverEntry
        const entry = { contentRect: { width: 500 } } as unknown as ResizeObserverEntry;
        this.callback([entry], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

const preview = (bytes: Uint8Array) => (
  <PdfPreview bytes={bytes} documentComponent={FakeDocument} pageComponent={FakePage} />
);

describe("PdfPreview", () => {
  it("shows every page of the file", async () => {
    render(preview(new Uint8Array([1])));
    expect(await screen.findByText("Page 2")).toBeInTheDocument();
  });

  // The app has no <Suspense> boundary: a suspending document crashed the dialog the
  // moment an option (Landscape) made a new file.
  it("never suspends, so a new file after an option change does not crash", async () => {
    const view = render(preview(new Uint8Array([1])));
    await screen.findByText("Page 2");
    view.rerender(preview(new Uint8Array([2])));
    await screen.findByText("Page 2");
    expect(suspenseSeen.length).toBeGreaterThan(0);
    expect(suspenseSeen.every((value) => value === false)).toBe(true);
  });
});
