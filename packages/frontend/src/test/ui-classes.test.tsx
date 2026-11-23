import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CARD_CLASSES,
  CARD_DESCRIPTION_CLASSES,
  CARD_TITLE_CLASSES,
  FIELD_LABEL_CLASSES,
  INPUT_CLASSES,
  LABEL_CLASSES,
  SEPARATOR_CLASSES,
  SIDEBAR_GROUP_LABEL_CLASSES,
  SKELETON_CLASSES,
  TEXTAREA_CLASSES,
  sidebarMenuButtonVariants,
} from "@nookly/ui/classes";
import { Card, CardDescription, CardTitle } from "@nookly/ui/components/card";
import { FieldLabel } from "@nookly/ui/components/field-label";
import { Input } from "@nookly/ui/components/input";
import { Checkbox } from "@nookly/ui/components/checkbox";
import { Label } from "@nookly/ui/components/label";
import { Separator } from "@nookly/ui/components/separator";
import {
  SidebarGroupLabel,
  SidebarMenuButton,
  SidebarProvider,
} from "@nookly/ui/components/sidebar";
import { Skeleton } from "@nookly/ui/components/skeleton";
import { Textarea } from "@nookly/ui/components/textarea";
import { cn } from "@nookly/ui/lib/utils";

/// `@nookly/ui/classes` is where the primitives' classes are written, for the desktop's
/// primitives and the phone's (NativeWind). Every primitive renders exactly those.
const cases: [string, React.ReactElement, string][] = [
  ["Input", <Input />, INPUT_CLASSES],
  ["Textarea", <Textarea />, TEXTAREA_CLASSES],
  ["Label", <Label />, LABEL_CLASSES],
  ["FieldLabel", <FieldLabel />, FIELD_LABEL_CLASSES],
  ["Separator", <Separator />, SEPARATOR_CLASSES],
  ["Skeleton", <Skeleton />, SKELETON_CLASSES],
  ["Card", <Card />, CARD_CLASSES],
  ["CardTitle", <CardTitle />, CARD_TITLE_CLASSES],
  ["CardDescription", <CardDescription />, CARD_DESCRIPTION_CLASSES],
];

describe("the primitives' classes the phone uses", () => {
  it.each(cases)("%s renders its shared classes", (_, element, classes) => {
    const { container } = render(element);
    expect(container.firstElementChild?.className).toBe(cn(classes));
  });

  it("a Label next to a checkbox or switch shows the pointer, like the control it activates", () => {
    const { getByText, getByRole } = render(
      <>
        <Checkbox id="agree" />
        <Label htmlFor="agree">Agree</Label>
      </>,
    );
    // Radix's checkbox is a peer button: the label after it follows its state.
    expect(getByRole("checkbox")).toHaveClass("peer");
    expect(getByText("Agree")).toHaveClass("peer-enabled:cursor-pointer");
  });

  it("SidebarMenuButton and SidebarGroupLabel render theirs", () => {
    // jsdom has no matchMedia, which the sidebar uses to tell a phone from a desktop.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(
      <SidebarProvider>
        <SidebarGroupLabel />
        <SidebarMenuButton size="sm" />
      </SidebarProvider>,
    );
    vi.unstubAllGlobals();
    expect(container.querySelector("[data-sidebar=group-label]")?.className).toBe(
      cn(SIDEBAR_GROUP_LABEL_CLASSES),
    );
    expect(container.querySelector("[data-sidebar=menu-button]")?.className).toBe(
      cn(sidebarMenuButtonVariants({ size: "sm" })),
    );
  });
});
