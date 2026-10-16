import { useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import { createThumbnails } from "./pdf-thumb-queue.ts";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/// Wide enough to stay sharp on a retina screen at the size a tile shows it.
const THUMB_WIDTH = 480;

/// The first page of a PDF as an image.
async function drawFirstPage(url: string): Promise<string> {
  const task = pdfjs.getDocument({ url });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const scale = THUMB_WIDTH / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) throw new Error("no canvas");
    await page.render({ canvas, canvasContext, viewport, background: "white" }).promise;
    page.cleanup();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("could not make an image of the page");
    return URL.createObjectURL(blob);
  } finally {
    void task.destroy();
  }
}

const thumbnails = createThumbnails({
  draw: drawFirstPage,
  atOnce: 2,
  keep: 300,
  release: (url) => URL.revokeObjectURL(url),
});

/// First page of a PDF, filling its box width.
export default function PdfThumb({ src, onError }: { src: string; onError: () => void }) {
  const [url, setUrl] = useState(() => thumbnails.cached(src));
  // A new callback each render must not take the request back and ask again.
  const failed = useRef(onError);
  failed.current = onError;
  useEffect(() => {
    const drawn = thumbnails.cached(src);
    setUrl(drawn);
    if (drawn) return;
    return thumbnails.request(src, setUrl, () => failed.current());
  }, [src]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      onError={() => failed.current()}
      className="size-full object-cover object-top"
    />
  );
}
