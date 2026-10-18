import { describe, expect, it } from "vitest";
import {
  assignableRoleSchema,
  campaignDetailsSchema,
  inviteSchema,
  inviteTokenSchema,
} from "./validation";

describe("campaignDetailsSchema", () => {
  it("accepts a campaign and trims it", () => {
    const r = campaignDetailsSchema.safeParse({
      name: "  Curse of the Salt Marsh ",
      gameSystem: "Homebrew 5e",
      description: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Curse of the Salt Marsh");
  });

  it("requires a name", () => {
    expect(
      campaignDetailsSchema.safeParse({ name: "  ", gameSystem: "", description: "" })
        .success,
    ).toBe(false);
  });
});

describe("inviteSchema", () => {
  it("turns form text into numbers", () => {
    const r = inviteSchema.safeParse({ days: "7", maxUses: "10" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ days: 7, maxUses: 10 });
  });

  it("rejects out-of-range values", () => {
    expect(inviteSchema.safeParse({ days: "0", maxUses: "10" }).success).toBe(false);
    expect(inviteSchema.safeParse({ days: "7", maxUses: "500" }).success).toBe(false);
    expect(inviteSchema.safeParse({ days: "abc", maxUses: "10" }).success).toBe(false);
  });
});

describe("inviteTokenSchema", () => {
  it("accepts only 48 hex characters", () => {
    expect(inviteTokenSchema.safeParse("a".repeat(48)).success).toBe(true);
    expect(inviteTokenSchema.safeParse("a".repeat(47)).success).toBe(false);
    expect(inviteTokenSchema.safeParse("<script>").success).toBe(false);
  });
});

describe("assignableRoleSchema", () => {
  it("never allows assigning owner directly", () => {
    expect(assignableRoleSchema.safeParse("owner").success).toBe(false);
    expect(assignableRoleSchema.safeParse("co_dm").success).toBe(true);
  });
});
