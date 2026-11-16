import { fireEvent } from "expo-router/testing-library";
import { useState } from "react";
import { renderScreens, testData } from "../test/render.tsx";
import { PropertyList } from "./Property.tsx";
import { ChoiceProperty } from "./property-rows.tsx";
import { DateField } from "./DateField.tsx";
import { SelectField } from "./SelectField.tsx";

function Status() {
  const [value, setValue] = useState<"todo" | "done">("todo");
  return (
    <PropertyList>
      <ChoiceProperty
        label="Status"
        value={value}
        onChange={setValue}
        options={[
          { id: "todo", label: "Todo" },
          { id: "done", label: "Done" },
        ]}
      />
    </PropertyList>
  );
}

// A tablet's property rows open their picker as a popover hanging from the row (3.5), even
// when no finger touched it (a keyboard, VoiceOver).
describe("a property's picker on a tablet", () => {
  it("is a popover from its row, and the phone's sheet on a phone", async () => {
    const tablet = await renderScreens({ index: Status }, testData(), "/", { width: 1032 });
    await fireEvent.press(await tablet.findByRole("button", { name: "Status, Todo" }));
    expect(await tablet.findByTestId("sheet-popover")).toBeTruthy();
    tablet.unmount();
    const phone = await renderScreens({ index: Status }, testData());
    await fireEvent.press(await phone.findByRole("button", { name: "Status, Todo" }));
    expect(phone.queryByTestId("sheet-popover")).toBeNull();
  });

  it("opens a form's select and date fields as popovers from the field", async () => {
    const Form = () => (
      <>
        <SelectField
          label="Priority"
          value={null}
          onChange={() => {}}
          options={[{ id: "high", label: "High" }]}
        />
        <DateField label="Due" value={null} onChange={() => {}} />
      </>
    );
    for (const name of [/^Priority/, /^Due/]) {
      const screen = await renderScreens({ index: Form }, testData(), "/", { width: 1032 });
      await fireEvent.press(await screen.findByRole("button", { name }));
      expect(await screen.findByTestId("sheet-popover")).toBeTruthy();
      screen.unmount();
    }
  });
});
