import { describe, expect, it } from "vitest";
import { safeNextPath } from "./origin";

describe("safeNextPath", () => {
  it("keeps paths inside the site", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
  });

  it("falls back to Home for missing or outside addresses", () => {
    expect(safeNextPath(null)).toBe("/home");
    expect(safeNextPath("")).toBe("/home");
    expect(safeNextPath("https://evil.example")).toBe("/home");
    expect(safeNextPath("//evil.example")).toBe("/home");
    expect(safeNextPath("/\\evil.example")).toBe("/home");
  });
});
