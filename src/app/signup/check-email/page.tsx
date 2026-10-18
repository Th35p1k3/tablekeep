import Link from "next/link";
import { AuthPage, linkClass } from "@/components/ui";

export default function CheckEmailPage() {
  return (
    <AuthPage title="Check your email">
      <p className="leading-relaxed">
        We sent you a confirmation link. Open it on this device to finish
        creating your account. If it doesn’t arrive within a few minutes, check
        your spam folder.
      </p>
      <p className="mt-4">
        <Link href="/login" className={linkClass}>
          Back to log in
        </Link>
      </p>
    </AuthPage>
  );
}
