import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./errors";

describe("friendlyAuthError", () => {
  it("explains wrong login details", () => {
    expect(friendlyAuthError({ code: "invalid_credentials" })).toBe(
      "Email or password is incorrect.",
    );
  });

  it("explains an email missing from the invite list", () => {
    expect(
      friendlyAuthError({ message: "This email is not on the invite list." }),
    ).toContain("invite list");
  });

  it("explains a rejected email address", () => {
    expect(friendlyAuthError({ code: "email_address_invalid" })).toContain(
      "won’t accept this email",
    );
  });

  it("explains rate limits", () => {
    expect(friendlyAuthError({ code: "over_request_rate_limit" })).toContain(
      "Too many attempts",
    );
  });

  it("falls back to a general message", () => {
    expect(friendlyAuthError({ code: "something_new" })).toBe(
      "Something went wrong. Please try again.",
    );
    expect(friendlyAuthError(null)).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
