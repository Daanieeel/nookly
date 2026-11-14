import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { InlineSelect, placeMenu } from "./InlineMenu.tsx";

const OPTIONS = [
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
];

describe("Linear's inline select (D65)", () => {
  it("opens its choices next to the value and closes on a pick", async () => {
    function Row() {
      const [value, setValue] = useState("status");
      return <InlineSelect label="Grouping" value={value} options={OPTIONS} onChange={setValue} />;
    }
    const screen = render(<Row />);
    fireEvent.press(screen.getByRole("button", { name: "Grouping, Status" }));
    const priority = await screen.findByRole("menuitem", { name: "Priority" });
    expect(screen.getByRole("menuitem", { name: "Status" }).props.accessibilityState).toEqual({
      checked: true,
    });
    fireEvent.press(priority);
    expect(await screen.findByRole("button", { name: "Grouping, Priority" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Priority" })).toBeNull();
  });

  it("puts the menu under the value, right edges together, or above it when there is no room", () => {
    const window = { width: 400, height: 800 };
    expect(
      placeMenu({
        anchor: { x: 200, y: 100, width: 180, height: 50 },
        window,
        count: 3,
      }),
    ).toEqual({ left: 130, top: 156 });
    const low = placeMenu({
      anchor: { x: 200, y: 700, width: 180, height: 50 },
      window,
      count: 3,
    });
    expect(low.top).toBeLessThan(700);
  });
});
