import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";

// A owns templates; C is a stranger. Skipped if settings are missing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const creds = (letter: "A" | "C") => ({
  email: process.env[`TEST_USER_${letter}_EMAIL`],
  password: process.env[`TEST_USER_${letter}_PASSWORD`],
});
const users = { a: creds("A"), c: creds("C") };
const ready = Boolean(url && key && Object.values(users).every((u) => u.email && u.password));

async function signedIn(email: string, password: string) {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Couldn't sign in ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

type Session = Awaited<ReturnType<typeof signedIn>>;

describe.skipIf(!ready)("template storage and versions", () => {
  let a: Session;
  let c: Session;
  let templateId = "";
  let copyId = "";

  const versions = async (client: Session["client"], id: string) => {
    const { data } = await client
      .from("sheet_template_versions")
      .select("id, status, version_number, definition")
      .eq("template_id", id)
      .order("created_at");
    return data ?? [];
  };

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    c = await signedIn(users.c.email!, users.c.password!);
    const { data, error } = await a.client.rpc("create_template", {
      p_name: "[test] template",
      p_game_system: "Test system",
      p_description: "Created by the automated tests. Safe to delete.",
      p_definition: STARTER_TEMPLATE,
    });
    if (error) throw new Error(error.message);
    templateId = data as string;
  });

  afterAll(async () => {
    for (const id of [templateId, copyId]) {
      if (id) await a.client.rpc("delete_template", { p_template: id });
    }
  });

  it("a new template starts with one draft", async () => {
    const v = await versions(a.client, templateId);
    expect(v).toHaveLength(1);
    expect(v[0].status).toBe("draft");
    expect(v[0].version_number).toBeNull();
  });

  it("strangers can't see templates or versions", async () => {
    const { data: t } = await c.client.from("sheet_templates").select("id").eq("id", templateId);
    expect(t ?? []).toHaveLength(0);
    expect(await versions(c.client, templateId)).toHaveLength(0);
  });

  it("strangers can't publish, edit, copy or delete", async () => {
    for (const fn of ["publish_template", "start_template_draft", "duplicate_template", "delete_template"]) {
      const { error } = await c.client.rpc(fn, { p_template: templateId });
      expect(error?.message).toContain("not_allowed");
    }
    const { data } = await c.client
      .from("sheet_templates")
      .update({ name: "Hacked" })
      .eq("id", templateId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("the owner can edit the draft", async () => {
    const draft = (await versions(a.client, templateId))[0];
    const changed = { ...STARTER_TEMPLATE, sections: STARTER_TEMPLATE.sections.slice(0, 1) };
    const { data, error } = await a.client
      .from("sheet_template_versions")
      .update({ definition: changed })
      .eq("id", draft.id)
      .select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("publishing freezes the draft as version 1", async () => {
    const { data, error } = await a.client.rpc("publish_template", { p_template: templateId });
    expect(error).toBeNull();
    expect(data).toBe(1);
    const v = await versions(a.client, templateId);
    expect(v.map((x) => [x.status, x.version_number])).toEqual([["published", 1]]);
  });

  it("published versions can't be changed, even by the owner", async () => {
    const published = (await versions(a.client, templateId))[0];
    const { data } = await a.client
      .from("sheet_template_versions")
      .update({ definition: STARTER_TEMPLATE })
      .eq("id", published.id)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    const after = (await versions(a.client, templateId))[0];
    expect(after.definition.sections).toHaveLength(1);
  });

  it("publishing again without a draft is refused", async () => {
    const { error } = await a.client.rpc("publish_template", { p_template: templateId });
    expect(error?.message).toContain("no_draft");
  });

  it("a new draft copies the latest version and publishes as version 2", async () => {
    const first = await a.client.rpc("start_template_draft", { p_template: templateId });
    expect(first.error).toBeNull();
    const again = await a.client.rpc("start_template_draft", { p_template: templateId });
    expect(again.data).toBe(first.data);

    const v = await versions(a.client, templateId);
    const draft = v.find((x) => x.status === "draft");
    expect(draft?.definition.sections).toHaveLength(1);

    const { data } = await a.client.rpc("publish_template", { p_template: templateId });
    expect(data).toBe(2);
    const numbers = (await versions(a.client, templateId)).map((x) => x.version_number);
    expect(numbers).toEqual([1, 2]);
  });

  it("drafts can be thrown away when a published version exists", async () => {
    await a.client.rpc("start_template_draft", { p_template: templateId });
    const { error } = await a.client.rpc("discard_template_draft", { p_template: templateId });
    expect(error).toBeNull();
    const statuses = (await versions(a.client, templateId)).map((x) => x.status);
    expect(statuses).toEqual(["published", "published"]);
  });

  it("copies start as a fresh draft that can't be discarded", async () => {
    const { data, error } = await a.client.rpc("duplicate_template", { p_template: templateId });
    expect(error).toBeNull();
    copyId = data as string;
    const { data: copy } = await a.client
      .from("sheet_templates")
      .select("name")
      .eq("id", copyId)
      .single();
    expect(copy?.name).toBe("Copy of [test] template");
    const v = await versions(a.client, copyId);
    expect(v.map((x) => x.status)).toEqual(["draft"]);
    const discard = await a.client.rpc("discard_template_draft", { p_template: copyId });
    expect(discard.error?.message).toContain("only_draft");
  });
});
