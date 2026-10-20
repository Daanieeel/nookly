import { NavHistory } from "./history.ts";

describe("back and forward", () => {
  it("goes back and forward through the pages you opened", () => {
    const h = new NavHistory();
    h.visit("/");
    h.visit("/tasks");
    h.visit("/entity/a");
    expect(h.canGoBack()).toBe(true);
    expect(h.canGoForward()).toBe(false);
    expect(h.back()).toBe("/tasks");
    expect(h.back()).toBe("/");
    expect(h.canGoBack()).toBe(false);
    expect(h.canGoForward()).toBe(true);
    expect(h.forward()).toBe("/tasks");
  });

  it("does not count the page the router already shows as a new visit", () => {
    const h = new NavHistory();
    h.visit("/");
    h.visit("/tasks");
    expect(h.back()).toBe("/");
    // The router reports where it landed after back; that is not a new page.
    h.visit("/");
    expect(h.canGoForward()).toBe(true);
    expect(h.forward()).toBe("/tasks");
    h.visit("/tasks");
    expect(h.canGoForward()).toBe(false);
  });

  it("drops what was ahead when you open something new after going back", () => {
    const h = new NavHistory();
    h.visit("/");
    h.visit("/tasks");
    h.back();
    h.visit("/");
    h.visit("/calendar");
    expect(h.canGoForward()).toBe(false);
    expect(h.back()).toBe("/");
  });

  it("leaves sheets out, they are not places to come back to", () => {
    const h = new NavHistory();
    h.visit("/");
    h.visit("/new/task");
    h.visit("/tasks");
    expect(h.back()).toBe("/");
  });

  it("has nowhere to go with a single page", () => {
    const h = new NavHistory();
    h.visit("/");
    expect(h.back()).toBeNull();
    expect(h.forward()).toBeNull();
  });
});
