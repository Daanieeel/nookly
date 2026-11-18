import { fireEvent, render, screen } from "@testing-library/react-native";
import { Field } from "./Field.tsx";
import { RevealProvider } from "./Screen.tsx";
import { Sheet } from "./sheet/Sheet.tsx";

// The Note on a bookmark's page sat under the keyboard while typing. A field on a page asks
// the page to keep it in view, its whole height, once someone types in it.
describe("a field on a page", () => {
  it("asks the page to keep it in view above the keyboard while typing", () => {
    const reveal = jest.fn();
    render(
      <RevealProvider value={reveal}>
        <Field label="Note" multiline value="" onChangeText={() => {}} />
      </RevealProvider>,
    );
    fireEvent(screen.getByTestId("field-Note"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } },
    });
    expect(reveal).not.toHaveBeenCalled();
    fireEvent(screen.getByLabelText("Note"), "focus");
    expect(reveal).toHaveBeenCalledWith(expect.anything(), 120);
  });

  // A sheet opened from a page (New View on Files) scrolled the page behind it when its
  // name field took the focus: the sheet scrolls itself, the page stays where it was.
  it("leaves the page behind a sheet alone", () => {
    const reveal = jest.fn();
    render(
      <RevealProvider value={reveal}>
        <Sheet open onOpenChange={() => {}} title="New View">
          <Field label="View name" value="" onChangeText={() => {}} />
        </Sheet>
      </RevealProvider>,
    );
    fireEvent(screen.getByLabelText("View name"), "focus");
    expect(reveal).not.toHaveBeenCalled();
  });

  it("does nothing where no page scrolls (a sheet)", () => {
    render(<Field label="Note" multiline value="" onChangeText={() => {}} />);
    expect(() => fireEvent(screen.getByLabelText("Note"), "focus")).not.toThrow();
  });
});
