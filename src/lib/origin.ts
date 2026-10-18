import { headers } from "next/headers";

/** The address the visitor is using (localhost or the Vercel site). */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only allows paths inside this site, so links can't redirect elsewhere. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/home";
  }
  return value;
}
