import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";
import { AuthPage, linkClass } from "@/components/ui";

export default function LoginPage() {
  return (
    <AuthPage
      title="Log in"
      footer={
        <div className="space-y-2">
          <p>
            <Link href="/reset" className={linkClass}>
              Forgot your password?
            </Link>
          </p>
          <p>
            New here?{" "}
            <Link href="/signup" className={linkClass}>
              Create an account
            </Link>
          </p>
        </div>
      }
    >
      <Suspense fallback={<p>Loading…</p>}>
        <LoginForm />
      </Suspense>
    </AuthPage>
  );
}
