import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a display name.")
  .max(50, "Keep it to 50 characters or fewer.");

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    message: "The passwords don’t match.",
    path: ["confirm"],
  });

export const profileSchema = z.object({ displayName: displayNameSchema });

export const deleteAccountSchema = z.object({
  confirm: z.string().refine((v) => v === "DELETE", {
    message: "Type DELETE in capital letters to confirm.",
  }),
});
