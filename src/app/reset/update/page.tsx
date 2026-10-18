import { Suspense } from "react";
import Link from "next/link";
import { NewPasswordForm } from "@/components/auth-forms";
import { AuthPage, linkClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";

async function ResetGate() {
  const { user } = await getCurrentUser();
  if (!user) {
    return (
      <p className="leading-relaxed">
        This reset link has expired or was already used.{" "}
        <Link href="/reset" className={linkClass}>
          Request a new one
        </Link>
        .
      </p>
    );
  }
  return (
    <>
      <NewPasswordForm submitLabel="Save new password" />
      <p className="mt-4 text-sm">
        <Link href="/home" className={linkClass}>
          Go to Tablekeep
        </Link>
      </p>
    </>
  );
}

export default function ResetUpdatePage() {
  return (
    <AuthPage title="Choose a new password">
      <Suspense fallback={<p>Loading…</p>}>
        <ResetGate />
      </Suspense>
    </AuthPage>
  );
}
