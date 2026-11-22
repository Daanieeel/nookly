import { describe, expect, it } from "vitest";
import { splitUrl, typedUrl } from "./url-field.ts";

describe("splitUrl", () => {
  it("takes the https:// off a whole address", () => {
    expect(splitUrl("https://sync.example.com")).toEqual({
      scheme: "https://",
      rest: "sync.example.com",
      explicit: true,
    });
  });

  it("keeps http:// as the scheme, for a server on this network", () => {
    expect(splitUrl("http://127.0.0.1:3100")).toEqual({
      scheme: "http://",
      rest: "127.0.0.1:3100",
      explicit: true,
    });
  });

  it("reads webcal:// as https://, how calendar apps share links", () => {
    expect(splitUrl("webcal://uni.edu/cal.php").scheme).toBe("https://");
    expect(splitUrl("webcal://uni.edu/cal.php").rest).toBe("uni.edu/cal.php");
  });

  it("ignores case and spaces around the scheme", () => {
    expect(splitUrl("  HTTPS://Uni.edu").rest).toBe("Uni.edu");
  });

  it("takes off a scheme that was pasted twice", () => {
    expect(splitUrl("https://https://uni.edu").rest).toBe("uni.edu");
  });

  it("leaves an address without a scheme as it is and assumes https://", () => {
    expect(splitUrl("uni.edu/my")).toEqual({
      scheme: "https://",
      rest: "uni.edu/my",
      explicit: false,
    });
    expect(splitUrl("")).toEqual({ scheme: "https://", rest: "", explicit: false });
  });

  it("does not treat a scheme in the middle of the text as one", () => {
    expect(splitUrl("go.to/https://x").rest).toBe("go.to/https://x");
  });
});

describe("typedUrl", () => {
  it("adds the shown scheme to what was typed", () => {
    expect(typedUrl("sync.example.com", "https://")).toEqual({
      scheme: "https://",
      value: "https://sync.example.com",
    });
  });

  it("is empty when nothing is typed, so the field can show its placeholder", () => {
    expect(typedUrl("", "https://")).toEqual({ scheme: "https://", value: "" });
  });

  it("drops a pasted https:// instead of doubling it", () => {
    expect(typedUrl("https://sync.example.com", "https://").value).toBe("https://sync.example.com");
  });

  it("switches to http:// when that is typed, and remembers it while nothing follows yet", () => {
    expect(typedUrl("http://", "https://")).toEqual({ scheme: "http://", value: "" });
    expect(typedUrl("127.0.0.1", "http://")).toEqual({
      scheme: "http://",
      value: "http://127.0.0.1",
    });
  });

  it("keeps the scheme when the text is edited in the middle", () => {
    expect(typedUrl("syn.example.com", "http://").value).toBe("http://syn.example.com");
  });
});
