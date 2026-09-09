import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./auth.middleware.js";

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme and tolerates extra whitespace", () => {
    expect(extractBearerToken("  bearer   abc.def  ")).toBe("abc.def");
  });

  it("returns null when the header is missing, empty or malformed", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("abc.def.ghi")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("Token abc")).toBeNull();
  });
});
