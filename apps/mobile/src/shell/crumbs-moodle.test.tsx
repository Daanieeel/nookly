import { within } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { connected } from "../test/fake-moodle.tsx";
import { Crumbs } from "./Crumbs.tsx";

// A Moodle page's crumbs name its course before it (9.2), the course a link back to it.
describe("a Moodle page's crumbs", () => {
  it("name the course between Moodle and the page", async () => {
    const moodle = connected({
      core_enrol_get_users_courses: [{ id: 2, shortname: "ALG", fullname: "Algorithms" }],
    });
    const screen = await renderScreens(
      {
        index: moodle.wrap(
          <Crumbs path="/moodle/forum/3?courseId=2&name=Announcements" short={false} />,
        ),
      },
      testData(),
      "/",
      { width: 1194 },
    );
    const crumbs = within(await screen.findByTestId("crumbs"));
    expect(crumbs.getByText("Moodle")).toBeTruthy();
    expect(await crumbs.findByRole("link", { name: "Algorithms" })).toBeTruthy();
  });
});
