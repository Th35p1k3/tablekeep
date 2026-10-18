import Link from "next/link";
import { AuthPage, linkClass } from "@/components/ui";

export default function LinkErrorPage() {
  return (
    <AuthPage title="That link didn’t work">
      <p className="leading-relaxed">
        Email links expire after a while and can only be used once. Try logging
        in, or request a new password reset link.
      </p>
      <div className="mt-4 flex flex-wrap gap-4">
        <Link href="/login" className={linkClass}>
          Log in
        </Link>
        <Link href="/reset" className={linkClass}>
          Reset password
        </Link>
      </div>
    </AuthPage>
  );
}
