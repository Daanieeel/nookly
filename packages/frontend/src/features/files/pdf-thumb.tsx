import { Page, Document, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/// First page of a PDF, scaled to fill its box width.
export default function PdfThumb({
  src,
  width,
  onError,
}: {
  src: string;
  width: number;
  onError: () => void;
}) {
  return (
    <Document file={src} loading={null} error={null} onLoadError={onError} onSourceError={onError}>
      <Page
        pageNumber={1}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={null}
        onRenderError={onError}
      />
    </Document>
  );
}
