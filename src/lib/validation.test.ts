import { describe, expect, it } from "vitest";
import {
  deleteAccountSchema,
  loginSchema,
  newPasswordSchema,
  signUpSchema,
} from "./validation";

describe("signUpSchema", () => {
  it("accepts good input and tidies the email", () => {
    const r = signUpSchema.safeParse({
      displayName: "  Mira  ",
      email: "  Mira@Example.COM ",
      password: "correct horse",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("mira@example.com");
      expect(r.data.displayName).toBe("Mira");
    }
  });

  it("rejects a short password", () => {
    const r = signUpSchema.safeParse({
      displayName: "Mira",
      email: "mira@example.com",
      password: "short",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bad email and an empty name", () => {
    const r = signUpSchema.safeParse({
      displayName: "   ",
      email: "not-an-email",
      password: "long enough",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fields = r.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("email");
      expect(fields).toContain("displayName");
    }
  });
});

describe("loginSchema", () => {
  it("requires a password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "" }).success,
    ).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("requires both passwords to match", () => {
    const r = newPasswordSchema.safeParse({
      password: "long enough",
      confirm: "different one",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe("confirm");
  });
});

describe("deleteAccountSchema", () => {
  it("only accepts the exact word DELETE", () => {
    expect(deleteAccountSchema.safeParse({ confirm: "DELETE" }).success).toBe(
      true,
    );
    expect(deleteAccountSchema.safeParse({ confirm: "delete" }).success).toBe(
      false,
    );
  });
});
