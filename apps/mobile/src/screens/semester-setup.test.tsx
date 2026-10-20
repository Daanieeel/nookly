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
    expect(await screen.findByText("Step 1 of 5: Grading system")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Fall / Spring / Summer" }));
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Step 2 of 5: Region")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Fall" }));
    await fireEvent.press(screen.getByRole("radio", { name: "2026" }));
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    await fireEvent.press(screen.getByRole("radio", { name: "3" }));
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Step 5 of 5: Review")).toBeTruthy();
    expect(screen.getByText("Fall 2026 (current)")).toBeTruthy();
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
