import { render } from "@testing-library/react-native";
import { PresenceRow } from "./PresenceRow.tsx";

// Who else is on a live page, as the desktop's initials at its top (6.1, D6).
describe("who else is on the page", () => {
  it("shows an initial for each other person, named for VoiceOver", () => {
    const screen = render(
      <PresenceRow
        present={[
          { clientId: 1, name: "Ada on iPad", color: "#3b82f6" },
          { clientId: 2, name: "Linus on Mac", color: "#ec4899" },
        ]}
      />,
    );
    expect(screen.getByLabelText("Also on this page: Ada on iPad, Linus on Mac")).toBeTruthy();
    expect(screen.getByText("L")).toBeTruthy();
  });

  it("shows nothing when nobody else is here", () => {
    const screen = render(<PresenceRow present={[]} />);
    expect(screen.queryByLabelText(/^Also on this page/)).toBeNull();
  });
});
