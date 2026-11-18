import { base64Bytes } from "./files.ts";

describe("the Files inside a Nookly file", () => {
  it("decode from base64 to their exact bytes", () => {
    expect([...base64Bytes("AAEC/w==")]).toEqual([0, 1, 2, 255]);
    expect(new TextDecoder().decode(base64Bytes("aGVs\nbG8="))).toBe("hello");
  });
});
