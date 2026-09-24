import { invoke } from "@tauri-apps/api/core";

/// Whether LibreOffice is installed, which previews of slides, legacy Office,
/// OpenDocument and iWork files need.
export function officeConverterAvailable(): Promise<boolean> {
  return invoke("office_converter_available");
}

/// Converts an office File to PDF (cached per version); resolves to its path.
export function convertOfficeToPdf(entityId: string): Promise<string> {
  return invoke("convert_office_to_pdf", { entityId });
}
