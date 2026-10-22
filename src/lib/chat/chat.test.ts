import { describe, expect, it } from "vitest";
import { fileProblem, formatBytes, handoutFilePath, handoutSchema, pathBelongsTo, safeFileName } from "@/lib/handouts/rules";
import { type ChatMember, friendlyChatError, messageBodySchema, recipientsAllowed, whisperLabel, whisperTargets } from "./rules";

const members: ChatMember[] = [
  { user_id: "dm", display_name: "Will", role: "owner" },
  { user_id: "co", display_name: "Sam", role: "co_dm" },
  { user_id: "p1", display_name: "Bram", role: "player" },
  { user_id: "p2", display_name: "Mira", role: "player" },
];

describe("whisper rules", () => {
  it("DMs can whisper to anyone else", () => {
    expect(whisperTargets(members, "dm", "owner").map((m) => m.user_id)).toEqual(["co", "p1", "p2"]);
    expect(recipientsAllowed(["p1", "p2"], members, "dm", "owner")).toBe(true);
  });

  it("players can only whisper to DMs and Co-DMs", () => {
    expect(whisperTargets(members, "p1", "player").map((m) => m.user_id)).toEqual(["dm", "co"]);
    expect(recipientsAllowed(["dm"], members, "p1", "player")).toBe(true);
    expect(recipientsAllowed(["p2"], members, "p1", "player")).toBe(false);
    expect(recipientsAllowed(["dm", "p2"], members, "p1", "player")).toBe(false);
  });

  it("everyone (null) is always fine; empty lists and strangers aren't", () => {
    expect(recipientsAllowed(null, members, "p1", "player")).toBe(true);
    expect(recipientsAllowed([], members, "dm", "owner")).toBe(false);
    expect(recipientsAllowed(["stranger"], members, "dm", "owner")).toBe(false);
  });

  it("labels whispers readably", () => {
    const name = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "?";
    expect(whisperLabel(["p1"], "dm", name)).toBe("Whisper to Bram");
    expect(whisperLabel(["p1", "dm"], "p1", name)).toBe("Whisper to you and Will");
    expect(whisperLabel(["p1", "p2", "co"], "dm", name)).toBe("Whisper to Bram, Mira and Sam");
  });
});

describe("messages", () => {
  it("trims and limits message text", () => {
    expect(messageBodySchema.safeParse("   ").success).toBe(false);
    expect(messageBodySchema.safeParse("x".repeat(2001)).success).toBe(false);
    expect(messageBodySchema.safeParse("  Roll for initiative!  ").success).toBe(true);
  });

  it("explains the spam guard", () => {
    expect(friendlyChatError({ message: "slow_down" })).toContain("very fast");
  });
});

describe("handout files", () => {
  it("accepts images and PDFs up to 10 MB", () => {
    expect(fileProblem({ size: 1000, type: "image/png" })).toBeNull();
    expect(fileProblem({ size: 10 * 1024 * 1024, type: "application/pdf" })).toBeNull();
    expect(fileProblem({ size: 10 * 1024 * 1024 + 1, type: "image/jpeg" })).toContain("10 MB");
    expect(fileProblem({ size: 1000, type: "image/gif" })).toContain("JPG");
    expect(fileProblem({ size: 1000, type: "text/html" })).not.toBeNull();
    expect(fileProblem({ size: 0, type: "image/png" })).toContain("empty");
  });

  it.each([
    ["Map of Saltmarsh.png", "Map-of-Saltmarsh.png"],
    ["../../etc/passwd", "passwd"],
    ["wanted poster (final).JPG", "wanted-poster-final.jpg"],
    ["ünïcødé letter.pdf", "unic-de-letter.pdf"],
    [".hidden", "hidden"],
    ["no extension", "no-extension"],
    ["", "file"],
  ])("%j is stored as %j", (input, expected) => {
    expect(safeFileName(input)).toBe(expected);
  });

  it("keeps files inside their own handout folder", () => {
    const path = handoutFilePath("camp", "hand", "a b.png");
    expect(path).toBe("camp/hand/a-b.png");
    expect(pathBelongsTo(path, "camp", "hand")).toBe(true);
    expect(pathBelongsTo("camp/other/a.png", "camp", "hand")).toBe(false);
    expect(pathBelongsTo("camp/hand/x/y.png", "camp", "hand")).toBe(false);
    expect(pathBelongsTo("camp/hand/", "camp", "hand")).toBe(false);
  });

  it("validates handout text and visibility", () => {
    expect(handoutSchema.safeParse({ title: "Letter", body: "", visibility: "selected" }).success).toBe(true);
    expect(handoutSchema.safeParse({ title: "", body: "", visibility: "all" }).success).toBe(false);
    expect(handoutSchema.safeParse({ title: "x", body: "", visibility: "public" }).success).toBe(false);
  });

  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3 MB");
  });
});
