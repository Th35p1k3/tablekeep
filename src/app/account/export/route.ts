import { NextResponse } from "next/server";
import { buildExport } from "@/lib/portability/export";
import { createClient } from "@/lib/supabase/server";

/** Downloads everything you made as one JSON file. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", request.url));

  const file = await buildExport(supabase, data.user.id, data.user.email);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tablekeep-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
