import { createHash } from "node:crypto";
import { launchUrl, parseCallback, parseSite, signatureMatches } from "./login.ts";

// The phone hashes with expo-crypto; under Node, Node's own md5 stands in for it.
const nodeMd5 = async (text: string) => md5(text);

/// The desktop's own cases (`moodle/site.rs`, `moodle/login.rs`), so both sign in alike.
describe("a Moodle site's address", () => {
  it("is https, without the page a person pasted", () => {
    expect(parseSite("moodle.uni.edu").root).toBe("https://moodle.uni.edu");
    expect(parseSite("  moodle.uni.edu/  ").root).toBe("https://moodle.uni.edu");
    expect(parseSite("https://uni.edu/moodle/course/view.php?id=4").root).toBe(
      "https://uni.edu/moodle",
    );
    expect(parseSite("https://uni.edu/moodle/my/").root).toBe("https://uni.edu/moodle");
  });

  it("refuses an empty one and plain http", () => {
    expect(() => parseSite(" ")).toThrow("Enter the address of your Moodle site.");
    expect(() => parseSite("http://moodle.uni.edu")).toThrow("Moodle sites must use https.");
  });
});

describe("signing in to Moodle", () => {
  it("opens Moodle's own launch page for this app", () => {
    const url = new URL(launchUrl(parseSite("uni.edu/moodle"), "pp1", "nookly"));
    expect(url.pathname).toBe("/moodle/admin/tool/mobile/launch.php");
    expect(url.searchParams.get("service")).toBe("moodle_mobile_app");
    expect(url.searchParams.get("passport")).toBe("pp1");
    expect(url.searchParams.get("urlscheme")).toBe("nookly");
  });

  it("reads the token from the link Moodle sends back, whole or pasted", () => {
    const payload = btoa("abc123:::tok456");
    expect(parseCallback(`nookly://token=${payload}`)).toEqual({
      signature: "abc123",
      token: "tok456",
    });
    expect(parseCallback(payload)).toEqual({ signature: "abc123", token: "tok456" });
    expect(() => parseCallback("nookly://token=nonsense")).toThrow(
      "That is not a Moodle sign in link. Start the sign in again.",
    );
  });

  // Any page can open a nookly:// link: only a sign in started here is taken.
  it("takes a token only with the signature of a sign in started here", async () => {
    // md5("https://uni.edu/moodle" + "pp1")
    const signature = "2f7f2a0d4a5c0c6f0a9b0c1e5d3a7f11";
    expect(await signatureMatches(signature, ["https://uni.edu/moodle"], "pp1", nodeMd5)).toBe(
      false,
    );
    const real = md5("https://uni.edu/moodlepp1");
    expect(
      await signatureMatches(
        real,
        ["https://other.edu", "https://uni.edu/moodle/"],
        "pp1",
        nodeMd5,
      ),
    ).toBe(true);
  });
});

function md5(text: string) {
  return createHash("md5").update(text).digest("hex");
}
