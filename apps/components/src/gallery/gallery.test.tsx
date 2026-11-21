import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { GalleryShell, matches } from "@/components/gallery-shell";
import { DESKTOP_GALLERY } from "./index";

// The phone's components need react-native-web, which the bundler wires in and the tests do
// not, so the shell is handed a small phone gallery of its own.
const PHONE_GALLERY = [
  {
    id: "m-test",
    name: "Phone thing",
    group: "Controls",
    source: "apps/mobile/src/ui/Thing.tsx",
    render: () => <p>On a phone</p>,
  },
];
const loadPhone = () => Promise.resolve(PHONE_GALLERY);

describe("gallery registry", () => {
  it("has unique ids and a source file for every entry", () => {
    const ids = DESKTOP_GALLERY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of DESKTOP_GALLERY) expect(entry.source).toMatch(/\.tsx$/);
  });

  it.each(DESKTOP_GALLERY.map((e) => [e.name, e] as const))("renders %s", (_name, entry) => {
    const { container } = render(<TooltipProvider>{entry.render()}</TooltipProvider>);
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe("gallery shell", () => {
  it("filters by name and source", () => {
    const button = DESKTOP_GALLERY.find((e) => e.id === "button")!;
    expect(matches(button, "")).toBe(true);
    expect(matches(button, "BUTTON")).toBe(true);
    expect(matches(button, "button.tsx")).toBe(true);
    expect(matches(button, "no such thing")).toBe(false);
  });

  it("shows only what the filter matches", () => {
    render(<GalleryShell />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter components" }), {
      target: { value: "tooltip" },
    });
    expect(screen.getByRole("heading", { level: 3, name: "Tooltip" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Button" })).not.toBeInTheDocument();
  });

  it("switches to the phone's components, and back", async () => {
    render(<GalleryShell loadMobile={loadPhone} />);
    expect(screen.getByRole("heading", { level: 3, name: "Button" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getAllByRole("tab", { name: "Mobile" })[0]);
    expect(
      await screen.findByRole("heading", { level: 3, name: "Phone thing" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Button" })).not.toBeInTheDocument();
    expect(screen.getByText("On a phone")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getAllByRole("tab", { name: "Desktop" })[0]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 3, name: "Button" })).toBeInTheDocument(),
    );
  });
});
