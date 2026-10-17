import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { checkDatabase } from "@/lib/health";

// Runs on every visit: connection() tells Next.js not to pre-build or cache
// this part, which matters because it shows live database status.
async function HealthStatus() {
  await connection();
  const result = await checkDatabase();

  return result.ok ? (
    <p className="mt-4" data-testid="health-status">
      Database connected. Checked at {result.checkedAt}.
    </p>
  ) : (
    <p className="mt-4" data-testid="health-status">
      Database not connected: {result.reason}
    </p>
  );
}

export default function HealthPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">System health</h1>
      <Suspense
        fallback={
          <p className="mt-4" data-testid="health-checking">
            Checking the database…
          </p>
        }
      >
        <HealthStatus />
      </Suspense>
      <p className="mt-6">
        <Link href="/" className="underline underline-offset-4">
          Back to home
        </Link>
      </p>
    </main>
  );
}
