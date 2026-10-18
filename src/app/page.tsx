import Link from "next/link";
import { linkClass } from "@/components/ui";

export default function Landing() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Tablekeep</h1>
      <p className="mt-4 leading-relaxed">
        Campaigns, characters and homebrew for your table, in one place.
        Tablekeep is invite-only for now.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-md bg-amber-800 px-5 py-2.5 font-medium text-white hover:bg-amber-900"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-stone-300 px-5 py-2.5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
        >
          Sign up
        </Link>
      </div>
      <p className="mt-10 text-sm">
        <Link href="/health" className={linkClass}>
          System health
        </Link>
      </p>
    </main>
  );
}
