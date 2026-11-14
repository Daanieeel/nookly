import { createSpace, listSemesters } from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { SetupSemestersScreen } from "./SetupSemestersScreen.tsx";

describe("the semester setup", () => {
  it("goes through five steps and makes the semesters, the last one current", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens(
      { index: () => <SetupSemestersScreen spaceId={space} /> },
      data,
    );
    // D65: one question a step, its choices in a list, Continue pinned at the bottom.
    expect(await screen.findByLabelText("Step 1 of 5")).toBeTruthy();
    expect(screen.getByText("Which term system does your school use?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Fall / Spring / Summer" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Where do you study?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Which term is it now?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Fall" }));
    await fireEvent.press(screen.getByRole("radio", { name: "2026" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.press(screen.getByRole("radio", { name: "3" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Step 5 of 5")).toBeTruthy();
    expect(screen.getByText("Fall 2026")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    // Back goes a step back.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText("Step 4 of 5")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.press(screen.getByRole("button", { name: "Create Semesters" }));
    await waitFor(async () => {
      const made = await listSemesters(data.db, space);
      expect(made.map((s) => s.entity.title).sort()).toEqual([
        "Fall 2026",
        "Spring 2026",
        "Summer 2026",
      ]);
      expect(made.find((s) => s.isCurrent)?.entity.title).toBe("Fall 2026");
    });
  });
});
