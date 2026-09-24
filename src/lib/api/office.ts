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

export interface LibreOfficeInstallOptions {
  /// Homebrew is installed, so `brew install --cask libreoffice` works.
  brew: boolean;
  /// The official disk image can be installed directly (macOS).
  direct: boolean;
}

export function libreofficeInstallOptions(): Promise<LibreOfficeInstallOptions> {
  return invoke("libreoffice_install_options");
}

/// Resolves once LibreOffice is installed; progress arrives as
/// `LIBREOFFICE_INSTALL_EVENT` events meanwhile.
export function installLibreOffice(method: "brew" | "direct"): Promise<void> {
  return invoke("install_libreoffice", { method });
}

export const LIBREOFFICE_INSTALL_EVENT = "libreoffice-install";

export interface LibreOfficeInstallProgress {
  phase: "starting" | "downloading" | "installing" | "done";
  percent: number | null;
}
