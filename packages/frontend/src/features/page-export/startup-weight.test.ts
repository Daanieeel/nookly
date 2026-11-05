import { describe, expect, it } from "vitest";
import source from "./ExportPageDialog.tsx?raw";

/// The export dialog is imported by the sidebar's entity actions, so it loads at launch. The
/// PDF preview pulls in pdf.js, which only an open dialog needs, so it must load on demand.
describe("the export dialog at launch", () => {
  it("does not import the PDF preview (pdf.js) up front", () => {
    expect(source).not.toMatch(/^import .* from "\.\/export-preview(\.tsx)?";/m);
    expect(source).not.toMatch(/^import .* from "react-pdf";/m);
  });

  it("loads the PDF preview on demand", () => {
    expect(source).toMatch(/import\("\.\/export-preview\.tsx"\)/);
  });
});
