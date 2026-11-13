import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { Page } from "react-pdf";
import { describe, expect, it, vi } from "vitest";
import { PdfPageRow } from "./pdf-pages.tsx";

function FakePdfPage({ renderTextLayer, renderAnnotationLayer }: ComponentProps<typeof Page>) {
  return (
    <div
      data-testid="pdf-page"
      data-text-layer={String(renderTextLayer)}
      data-annotation-layer={String(renderAnnotationLayer)}
    />
  );
}

describe("PdfPageRow", () => {
  it("keeps text selectable on mounted pages outside the visible range", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void,
        ) {}
        observe() {
          this.callback([{ isIntersecting: true }]);
        }
        disconnect() {}
      },
    );

    render(
      <PdfPageRow
        pageComponent={FakePdfPage}
        page={1}
        width={100}
        height={100}
        renderScale={1}
        visible={false}
        pageClass=""
        scrollRef={{ current: null }}
        register={() => {}}
        customTextRenderer={() => ""}
        onPageSize={() => {}}
        onTextLayer={() => {}}
      />,
    );

    expect(screen.getByTestId("pdf-page")).toHaveAttribute("data-text-layer", "true");
    expect(screen.getByTestId("pdf-page")).toHaveAttribute("data-annotation-layer", "false");
  });
});
