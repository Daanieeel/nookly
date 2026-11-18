import type { CardBlock } from "@nookly/shared/data";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { docFace, faceDoc } from "./card-face.ts";
import { PageDocEditor } from "./LivePage.tsx";

/// One face of an index card written with the page editor, as the desktop's card writer
/// does: every block of a page, the `/` menu and formulas included. It starts from
/// `blocks` and hands every change on as blocks.
export function CardFaceEditor({
  deckId,
  label,
  placeholder,
  blocks,
  onChange,
}: {
  deckId: string;
  /// What a screen reader calls it: "Front of the card".
  label: string;
  placeholder: string;
  /// What the face holds when it opens; later changes of this are not taken in.
  blocks: CardBlock[];
  onChange: (blocks: CardBlock[]) => void;
}) {
  // SAFETY: the face is opened once; `blocks` is only where it starts.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => faceDoc(blocks), []);
  useEffect(() => {
    const changed = () => onChange(docFace(doc));
    doc.on("update", changed);
    return () => doc.off("update", changed);
  }, [doc, onChange]);
  return (
    <View accessibilityLabel={label}>
      <PageDocEditor
        doc={doc}
        awareness={null}
        entityId={deckId}
        editable
        fill={false}
        placeholder={placeholder}
      />
    </View>
  );
}
