import { describe, expect, it } from "vitest";
import { decodeSubmittable, encodeSubmittable, friendlyHomebrewError, reviewProblem } from "./rules";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("reviewProblem", () => {
  it("accepts approvals with or without a note", () => {
    expect(reviewProblem("approved", "")).toBeNull();
    expect(reviewProblem("approved", "Nice!")).toBeNull();
    expect(reviewProblem("rejected", "")).toBeNull();
  });

  it("requires a note when asking for changes", () => {
    expect(reviewProblem("changes_requested", "   ")).toContain("what should change");
    expect(reviewProblem("changes_requested", "Lower the damage to 6d6.")).toBeNull();
  });

  it("rejects unknown decisions and very long notes", () => {
    expect(reviewProblem("maybe", "")).not.toBeNull();
    expect(reviewProblem("approved", "x".repeat(1001))).not.toBeNull();
  });
});

describe("submittable values", () => {
  it("round-trips spells and templates", () => {
    expect(decodeSubmittable(encodeSubmittable("spell", ID))).toEqual({ type: "spell", versionId: ID });
    expect(decodeSubmittable(encodeSubmittable("template", ID))).toEqual({ type: "template", versionId: ID });
  });

  it("refuses anything else", () => {
    expect(decodeSubmittable("monster:" + ID)).toBeNull();
    expect(decodeSubmittable("spell:not-an-id")).toBeNull();
    expect(decodeSubmittable("")).toBeNull();
  });
});

describe("friendlyHomebrewError", () => {
  it("translates known codes", () => {
    expect(friendlyHomebrewError({ message: "already_pending" })).toContain("waiting for review");
    expect(friendlyHomebrewError({ message: "?" })).toContain("Something went wrong");
  });
});
