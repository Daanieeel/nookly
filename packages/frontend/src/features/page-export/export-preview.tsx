import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/// The exported pages as they will print, each as wide as the preview pane.
export function PdfPreview({ bytes }: { bytes: Uint8Array }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);
  // pdf.js takes the buffer over, so it gets a copy.
  const file = useMemo(() => ({ data: bytes.slice() }), [bytes]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <Document file={file} loading={null} onLoadSuccess={({ numPages }) => setPages(numPages)}>
          <div className="flex flex-col gap-3">
            {Array.from({ length: pages }, (_, i) => (
              <Page
                key={i}
                pageNumber={i + 1}
                width={width}
                loading={null}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-black/5"
              />
            ))}
          </div>
        </Document>
      )}
    </div>
  );
}
