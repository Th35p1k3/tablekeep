import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Tablekeep</h1>
      <p className="mt-4 leading-relaxed">
        The foundation is in place. Accounts, campaigns and characters arrive
        in the next phases.
      </p>
      <p className="mt-6">
        <Link href="/health" className="underline underline-offset-4">
          Check the database connection
        </Link>
      </p>
    </main>
  );
}
