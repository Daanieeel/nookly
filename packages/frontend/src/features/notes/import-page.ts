/// The files an import reads. The picker, the drop zone and the list of accepted formats
/// all come from this, so what the dialog says is what the importer takes.
export const PAGE_FILE_FILTER = { name: "Nookly page file", extensions: ["json"] };

/// The accepted formats as the dialog lists them: `Nookly page file (.json)`.
export function acceptedFormats(): string {
  return `${PAGE_FILE_FILTER.name} (${PAGE_FILE_FILTER.extensions.map((e) => `.${e}`).join(", ")})`;
}

/// Why an import failed, in the backend's own words when it gave any (a rejected command
/// carries the backend error, which has a `message`).
export function importFailureReason(error: { message?: string }): string {
  return error.message || "Couldn't import the page.";
}
