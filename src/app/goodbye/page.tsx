import Link from "next/link";
import { AuthPage, linkClass } from "@/components/ui";

export default function GoodbyePage() {
  return (
    <AuthPage title="Your account has been deleted">
      <p className="leading-relaxed">
        Your account and profile are gone. Thanks for playing.
      </p>
      <p className="mt-4">
        <Link href="/" className={linkClass}>
          Back to Tablekeep
        </Link>
      </p>
    </AuthPage>
  );
}
