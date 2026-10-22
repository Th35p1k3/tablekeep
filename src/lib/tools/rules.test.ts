import { describe, expect, it } from "vitest";
import { announcementSchema, describeActivity, dmNoteSchema, sessionLogSchema } from "./rules";

describe("announcementSchema", () => {
  it("needs a title", () => {
    expect(announcementSchema.safeParse({ title: " ", body: "", pinned: false }).success).toBe(false);
    expect(announcementSchema.safeParse({ title: "Next session Saturday", body: "", pinned: true }).success).toBe(true);
  });
});

describe("sessionLogSchema", () => {
  const base = { title: "The salt marsh", body: "We met a talking eel.", visibility: "players" };

  it("turns form text into a number and a date, or nothing", () => {
    const r = sessionLogSchema.safeParse({ ...base, sessionNumber: "12", playedOn: "2026-10-18" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sessionNumber).toBe(12);
      expect(r.data.playedOn).toBe("2026-10-18");
    }
    const blank = sessionLogSchema.safeParse({ ...base, sessionNumber: "", playedOn: "" });
    expect(blank.success && blank.data.sessionNumber === null && blank.data.playedOn === null).toBe(true);
  });

  it("rejects bad numbers, dates and visibility", () => {
    expect(sessionLogSchema.safeParse({ ...base, sessionNumber: "1.5", playedOn: "" }).success).toBe(false);
    expect(sessionLogSchema.safeParse({ ...base, sessionNumber: "", playedOn: "next week" }).success).toBe(false);
    expect(sessionLogSchema.safeParse({ ...base, sessionNumber: "", playedOn: "", visibility: "everyone" }).success).toBe(false);
  });
});

describe("dmNoteSchema", () => {
  it("limits note length", () => {
    expect(dmNoteSchema.safeParse({ title: "Bram", body: "x".repeat(20001) }).success).toBe(false);
  });
});

describe("describeActivity", () => {
  const names = (id: string) => ({ u1: "Bram", u2: "Mira" })[id] ?? "a former member";

  it.each([
    [{ action: "member_joined", details: { user_id: "u1", role: "player" } }, "Bram joined the campaign."],
    [{ action: "member_joined", details: { user_id: "u2", role: "owner" } }, "Mira created the campaign."],
    [{ action: "member_removed", details: { user_id: "u1" } }, "Will removed Bram from the campaign."],
    [{ action: "role_changed", details: { user_id: "u1", from: "player", to: "co_dm" } }, "Will changed Bram from Player to Co-DM."],
    [{ action: "setting_changed", details: { setting: "spells_need_approval", value: false } }, "Will let players use their own spells."],
    [{ action: "submission_reviewed", details: { type: "spell", decision: "changes_requested", user_id: "u1" } }, "Will asked for changes to a spell from Bram."],
    [{ action: "log_deleted", details: { title: "Session 3" } }, "Will deleted the session log “Session 3”."],
    [{ action: "member_left", details: { user_id: "gone" } }, "a former member left the campaign."],
    [{ action: "message_deleted", details: { user_id: "u1" } }, "Will deleted a chat message from Bram."],
    [{ action: "handout_created", details: { title: "Map" } }, "Will shared the handout “Map”."],
    [{ action: "something_new", details: {} }, "Will did something (something_new)."],
  ])("%j", (entry, sentence) => {
    expect(describeActivity({ ...entry, actorName: "Will" }, names)).toBe(sentence);
  });
});
