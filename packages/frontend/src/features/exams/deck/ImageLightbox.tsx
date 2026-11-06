import { Dialog, DialogContent, DialogTitle } from "@nookly/ui/components/dialog";

/// A picture of a card shown as large as the window allows.
export function ImageLightbox({
  image,
  onClose,
}: {
  image: { src: string; alt: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[92vh] max-w-[min(92vw,70rem)] justify-items-center"
      >
        <DialogTitle className="sr-only">{image?.alt || "Image"}</DialogTitle>
        {image && (
          <img
            src={image.src}
            alt={image.alt}
            className="max-h-[88vh] max-w-full rounded-md object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
