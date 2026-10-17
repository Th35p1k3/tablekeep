import { describe, expect, it } from "vitest";
import { interpretHealth } from "./health";

describe("interpretHealth", () => {
  it("reports success when the database answers correctly", () => {
    const result = interpretHealth(
      { ok: true, time: "2026-10-17T12:00:00Z" },
      null,
    );
    expect(result).toEqual({ ok: true, checkedAt: "2026-10-17T12:00:00Z" });
  });

  it("passes database errors through", () => {
    const result = interpretHealth(null, { message: "permission denied" });
    expect(result).toEqual({ ok: false, reason: "permission denied" });
  });

  it("rejects an unexpected response", () => {
    const result = interpretHealth({ hello: "world" }, null);
    expect(result.ok).toBe(false);
  });
});
