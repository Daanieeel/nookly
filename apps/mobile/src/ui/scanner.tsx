import { createContext, useContext } from "react";
import { File } from "expo-file-system";
import { pagesToPdf } from "../../modules/nookly-file-viewer/src/index.tsx";
import { storePicked } from "../data/files.ts";

/// How the phone scans a paper document: the system's document camera (VisionKit on iOS,
/// ML Kit on Android) through `expo-document-scanner`, or a test's stand in.
export interface DocumentScanner {
  /// False in a build without the scanner (Expo Go, tests): the scan button stays hidden.
  available: boolean;
  /// The scanned pages as one PDF, stored where the phone keeps its files (a `file://`
  /// URI), or null when the person backs out.
  scan(): Promise<string | null>;
}

interface ScannerModule {
  scanDocument(options: {
    quality?: number;
    includePdf?: boolean;
  }): Promise<{ pages: { uri: string }[]; pdfUri?: string }>;
}

/// Whether this build carries the scanner's native half. Asked lazily, as loading the
/// module without it throws.
function scannerInBuild(): boolean {
  try {
    // oxlint-disable-next-line typescript/no-require-imports -- only loadable in a build that has it
    const nitro: {
      NitroModules: { hasHybridObject(name: string): boolean };
    } = require("react-native-nitro-modules");
    return nitro.NitroModules.hasHybridObject("ExpoDocumentScanner");
  } catch {
    return false;
  }
}

const systemScanner: DocumentScanner = {
  get available() {
    return scannerInBuild();
  },
  scan: async () => {
    // oxlint-disable-next-line typescript/no-require-imports -- see scannerInBuild
    const { scanDocument }: ScannerModule = require("expo-document-scanner");
    let result: Awaited<ReturnType<ScannerModule["scanDocument"]>>;
    try {
      result = await scanDocument({ quality: 0.9, includePdf: true });
    } catch (error) {
      if (error instanceof Error && /cancel/i.test(error.message)) return null;
      throw error;
    }
    const pages = result.pages.map((page) => page.uri);
    if (!result.pdfUri && pages.length === 0) return null;
    const pdf = result.pdfUri ?? (await pagesToPdf(pages));
    return (await storePicked(new File(pdf))).uri;
  },
};

const ScannerContext = createContext<DocumentScanner>(systemScanner);
export const ScannerProvider = ScannerContext.Provider;
export const useScanner = () => useContext(ScannerContext);
