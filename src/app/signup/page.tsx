import { Suspense } from "react";
import Link from "next/link";
import { SignUpForm } from "@/components/auth-forms";
import { AuthPage, linkClass } from "@/components/ui";

export default function SignUpPage() {
  return (
    <AuthPage
      title="Create your account"
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className={linkClass}>
            Log in
          </Link>
        </p>
      }
    >
      <Suspense fallback={<p>Loading…</p>}>
        <SignUpForm />
      </Suspense>
    </AuthPage>
  );
}
