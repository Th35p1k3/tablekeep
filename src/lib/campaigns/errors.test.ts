import { describe, expect, it } from "vitest";
import { GENERIC_ERROR, friendlyCampaignError } from "./errors";

describe("friendlyCampaignError", () => {
  it("translates known codes", () => {
    expect(friendlyCampaignError({ message: "invite_expired" })).toContain("expired");
    expect(friendlyCampaignError({ message: "not_allowed" })).toContain("permission");
    expect(friendlyCampaignError({ message: "owns_campaigns" })).toContain(
      "own at least one campaign",
    );
  });

  it("falls back to a general message", () => {
    expect(friendlyCampaignError({ message: "boom" })).toBe(GENERIC_ERROR);
    expect(friendlyCampaignError(null)).toBe(GENERIC_ERROR);
  });
});
