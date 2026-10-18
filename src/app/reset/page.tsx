import Link from "next/link";
import { ResetRequestForm } from "@/components/auth-forms";
import { AuthPage, linkClass } from "@/components/ui";

export default function ResetPage() {
  return (
    <AuthPage
      title="Reset your password"
      footer={
        <Link href="/login" className={linkClass}>
          Back to log in
        </Link>
      }
    >
      <p className="mb-4 leading-relaxed">
        Enter your account email and we’ll send you a link to choose a new
        password.
      </p>
      <ResetRequestForm />
    </AuthPage>
  );
}
