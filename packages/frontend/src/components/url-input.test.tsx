import { screen } from "@testing-library/react";
import { IconServer } from "@tabler/icons-react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { UrlInput } from "./url-input.tsx";

function Harness({ initial = "", secret = false }: { initial?: string; secret?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <UrlInput
        icon={IconServer}
        aria-label="Server"
        value={value}
        onValueChange={setValue}
        secret={secret}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const held = () => screen.getByTestId("value").textContent;

describe("UrlInput", () => {
  it("shows https:// beside the icon so nobody types it", () => {
    renderWithProviders(<Harness initial="https://sync.example.com" />);
    expect(screen.getByText("https://")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Server" })).toHaveValue("sync.example.com");
  });

  it("holds the whole address for the form while showing only the rest", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Server" }), "sync.example.com");
    expect(held()).toBe("https://sync.example.com");
  });

  it("drops a pasted https:// instead of doubling it", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByRole("textbox", { name: "Server" }));
    await user.paste("https://sync.example.com/path");
    expect(held()).toBe("https://sync.example.com/path");
    expect(screen.getByRole("textbox", { name: "Server" })).toHaveValue("sync.example.com/path");
  });

  it("drops an https:// typed by hand once it is complete", async () => {
    const { user } = renderWithProviders(<Harness />);
    const input = screen.getByRole("textbox", { name: "Server" });
    await user.type(input, "https://uni.edu");
    expect(held()).toBe("https://uni.edu");
    expect(input).toHaveValue("uni.edu");
  });

  it("switches the shown scheme to http:// when that is typed, for a server on this network", async () => {
    const { user } = renderWithProviders(<Harness />);
    const input = screen.getByRole("textbox", { name: "Server" });
    await user.type(input, "http://127.0.0.1:3100");
    expect(screen.getByText("http://")).toBeInTheDocument();
    expect(input).toHaveValue("127.0.0.1:3100");
    expect(held()).toBe("http://127.0.0.1:3100");
  });

  it("shows nothing but the placeholder when emptied", async () => {
    const { user } = renderWithProviders(<Harness initial="https://uni.edu" />);
    await user.clear(screen.getByRole("textbox", { name: "Server" }));
    expect(held()).toBe("");
  });

  it("can hide the rest of the address like a password and keep the scheme visible", async () => {
    const { user } = renderWithProviders(
      <Harness secret initial="https://uni.edu/cal?authtoken=abc" />,
    );
    const input = screen.getByLabelText("Server");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByText("https://")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Link" }));
    expect(input).toHaveValue("uni.edu/cal?authtoken=abc");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<Harness initial="https://uni.edu" />);
    await expectNoA11yViolations(container);
  });
});
