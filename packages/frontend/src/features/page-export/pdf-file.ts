import interRegular from "@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url";
import interBold from "@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf?url";
import interItalic from "@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf?url";
import interBoldItalic from "@expo-google-fonts/inter/700Bold_Italic/Inter_700Bold_Italic.ttf?url";
import monoRegular from "@expo-google-fonts/source-code-pro/400Regular/SourceCodePro_400Regular.ttf?url";
import monoBold from "@expo-google-fonts/source-code-pro/700Bold/SourceCodePro_700Bold.ttf?url";
import monoItalic from "@expo-google-fonts/source-code-pro/400Regular_Italic/SourceCodePro_400Regular_Italic.ttf?url";
import monoBoldItalic from "@expo-google-fonts/source-code-pro/700Bold_Italic/SourceCodePro_700Bold_Italic.ttf?url";
import mathRegular from "@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf?url";
import type { ExportDocument } from "./document-model.ts";
import type { PageExportOptions } from "./export-options.ts";
import { PDF_FONTS, bytesToBase64, pdfLayout } from "./render-pdf.ts";

/// The fonts the PDF embeds, bundled with the app (it runs offline) and full, not a latin
/// subset, so Greek, Cyrillic and accented text print too. TrueType, not WOFF2: the PDF
/// writer breaks some glyphs when it trims a WOFF2 font down to the characters used.
const FONT_FILES = {
  [PDF_FONTS.body]: {
    normal: interRegular,
    bold: interBold,
    italics: interItalic,
    bolditalics: interBoldItalic,
  },
  [PDF_FONTS.mono]: {
    normal: monoRegular,
    bold: monoBold,
    italics: monoItalic,
    bolditalics: monoBoldItalic,
  },
  // Inline math: one upright face, the symbols Inter lacks (∧, ∈, ℝ, 𝔹) included.
  [PDF_FONTS.math]: {
    normal: mathRegular,
    bold: mathRegular,
    italics: mathRegular,
    bolditalics: mathRegular,
  },
};

type PdfMake = typeof import("pdfmake");

let loaded: Promise<PdfMake> | null = null;

/// pdfmake and the fonts, loaded the first time a PDF is made rather than with the app.
function loadPdfMake(): Promise<PdfMake> {
  loaded ??= (async () => {
    // SAFETY: the browser build is the same pdfmake API, typed only for the package root.
    const pdfMake = ((await import("pdfmake/build/pdfmake")) as { default: PdfMake }).default;
    const vfs: Record<string, string> = {};
    const fonts: Record<string, Record<string, string>> = {};
    await Promise.all(
      Object.entries(FONT_FILES).flatMap(([family, styles]) =>
        Object.entries(styles).map(async ([style, url]) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`couldn't load the font ${family} ${style}`);
          const name = `${family}-${style}.ttf`;
          vfs[name] = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
          (fonts[family] ??= {})[style] = name;
        }),
      ),
    );
    pdfMake.addVirtualFileSystem(vfs);
    pdfMake.setFonts(fonts);
    return pdfMake;
  })();
  loaded.catch(() => {
    loaded = null;
  });
  return loaded;
}

export async function pdfBytes(
  doc: ExportDocument,
  options: PageExportOptions,
): Promise<Uint8Array> {
  const pdfMake = await loadPdfMake();
  const { definition, formulas } = pdfLayout(doc, options);
  const bytes = new Uint8Array(await pdfMake.createPdf(definition).getBuffer());
  if (formulas.length === 0) return bytes;
  return (await import("./pdf-formulas.ts")).placeFormulas(bytes, formulas);
}
