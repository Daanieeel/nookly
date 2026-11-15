import { fireEvent, render, screen } from "@testing-library/react-native";
import { Field } from "./Field.tsx";
import { RevealProvider } from "./Screen.tsx";

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

  it("does nothing where no page scrolls (a sheet)", () => {
    render(<Field label="Note" multiline value="" onChangeText={() => {}} />);
    expect(() => fireEvent(screen.getByLabelText("Note"), "focus")).not.toThrow();
  });
});
