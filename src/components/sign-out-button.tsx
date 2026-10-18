import { signOut } from "@/lib/auth/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
      >
        Log out
      </button>
    </form>
  );
}
