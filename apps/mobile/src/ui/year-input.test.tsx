import { fireEvent, render, screen } from "@testing-library/react-native";
import { YearInput } from "./YearInput.tsx";

// The year of a new semester was a choice of three: last year, this year, next year. It is
// typed now, on the time input's large digits.
describe("a year input", () => {
  it("sets the year once four digits are typed", () => {
    const onChange = jest.fn();
    render(<YearInput label="Year" value={2026} onChange={onChange} />);
    const field = screen.getByLabelText("Year");
    expect(field.props.value).toBe("2026");
    fireEvent.changeText(field, "20");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.changeText(field, "2031");
    expect(onChange).toHaveBeenLastCalledWith(2031);
  });

  it("takes no year out of range and keeps only digits", () => {
    const onChange = jest.fn();
    render(<YearInput label="Year" value={2026} onChange={onChange} />);
    const field = screen.getByLabelText("Year");
    fireEvent.changeText(field, "0999");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.changeText(field, "20a28");
    expect(screen.getByLabelText("Year").props.value).toBe("2028");
    expect(onChange).toHaveBeenLastCalledWith(2028);
  });

  it("goes back to the year it has when left unfinished", () => {
    const onChange = jest.fn();
    render(<YearInput label="Year" value={2026} onChange={onChange} />);
    const field = screen.getByLabelText("Year");
    fireEvent.changeText(field, "20");
    fireEvent(field, "endEditing");
    expect(screen.getByLabelText("Year").props.value).toBe("2026");
  });
});
