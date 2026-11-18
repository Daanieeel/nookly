import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilterOptions } from "./DisplayParts.tsx";

const OPTIONS = [
  { id: "todo", label: "Todo" },
  { id: "done", label: "Done" },
];

// The choices of a filter kept their own ticks from when they opened: a filter dropped
// elsewhere (Discard, Clear Filters, a chip's X) still showed ticked, and the next tap
// unticked it instead of ticking it.
describe("a filter's choices", () => {
  it("follow a change made elsewhere", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <FilterOptions label="Status" options={OPTIONS} values={["todo"]} onChange={onChange} />,
    );
    expect(screen.getByRole("checkbox", { name: "Todo" }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    rerender(<FilterOptions label="Status" options={OPTIONS} values={[]} onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: "Todo" }).props.accessibilityState).toMatchObject({
      checked: false,
    });
    fireEvent.press(screen.getByRole("checkbox", { name: "Todo" }));
    expect(onChange).toHaveBeenLastCalledWith(["todo"]);
  });
});
