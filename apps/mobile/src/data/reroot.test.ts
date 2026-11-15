import { rerooted } from "./reroot.ts";

// A file's place was stored with the app's folder in it, which iOS names anew when the app
// is restored onto another phone (and after some reinstalls), so every file then looked
// missing. A place inside an app's Documents folder now reads from this app's own.
describe("a stored file's place", () => {
  const here = "file:///var/mobile/Containers/Data/Application/NEW-ID/Documents/";

  it("moves into this app's Documents folder", () => {
    expect(
      rerooted(
        "file:///var/mobile/Containers/Data/Application/OLD-ID/Documents/files/abc-notes.pdf",
        here,
      ),
    ).toBe(`${here}files/abc-notes.pdf`);
  });

  it("leaves a place already here, or outside any app's folder, as it is", () => {
    expect(rerooted(`${here}files/a.pdf`, here)).toBe(`${here}files/a.pdf`);
    expect(rerooted("https://example.com/a.pdf", here)).toBe("https://example.com/a.pdf");
    expect(rerooted("file:///tmp/a.pdf", here)).toBe("file:///tmp/a.pdf");
  });

  it("works on the simulator's folders too, and without a folder known", () => {
    const sim =
      "file:///Users/me/Library/Developer/CoreSimulator/Devices/D/data/Containers/Data/Application/OLD/Documents/x.pdf";
    expect(rerooted(sim, here)).toBe(`${here}x.pdf`);
    expect(rerooted(sim, null)).toBe(sim);
  });
});
