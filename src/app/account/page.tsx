import { Suspense } from "react";
import Link from "next/link";
import {
  DeleteAccountForm,
  NewPasswordForm,
  ProfileForm,
} from "@/components/auth-forms";
import { Card, linkClass, primaryLinkClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

async function AccountContent() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="mt-1 mb-4 text-sm text-stone-600 dark:text-stone-400">
          Signed in as {user.email}
        </p>
        <ProfileForm displayName={profile?.display_name ?? ""} />
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <NewPasswordForm submitLabel="Update password" />
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Your data</h2>
        <p className="mt-1 mb-4 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          Download everything you’ve made (characters, spells, sheet templates,
          presets, and the messages and logs you wrote) as one file. You can
          import characters, spells and templates from such a file into any account.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/account/export" download className={primaryLinkClass}>
            Download my data
          </a>
          <Link href="/account/import" className={secondaryButtonClass}>
            Import from a file
          </Link>
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-400">
          Delete account
        </h2>
        <p className="mt-1 mb-4 text-sm leading-relaxed">
          This permanently removes your account and profile. It can’t be
          undone.
        </p>
        <DeleteAccountForm />
      </Card>
    </div>
  );
}

export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/home" className={linkClass}>
          ← Back to home
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Account settings</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <AccountContent />
      </Suspense>
    </main>
  );
}
