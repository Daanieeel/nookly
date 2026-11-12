import { createSpace, updateSpace } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { useState } from "react";
import { renderScreens, testData } from "../test/render.tsx";
import { SpacePicker } from "./SpacePicker.tsx";

function Picker() {
  const [value, setValue] = useState<string | null>(null);
  return <SpacePicker value={value} onChange={setValue} />;
}

describe("the Space select", () => {
  // The desktop's select shows each Space's own icon; the phone showed only its colour.
  it("shows each Space's own icon", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await updateSpace(data.db, space, { icon: "🎓" });
    const screen = await renderScreens({ index: () => <Picker /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: /^Space, / }));
    expect(await screen.findByText("🎓")).toBeTruthy();
  });
});
