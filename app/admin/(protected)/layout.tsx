import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { checkAdmin } from "@/app/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await checkAdmin();

  if (!result.authorized) {
    redirect("/admin/login");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div className="flex items-baseline gap-4">
          <h1 className="text-xl font-semibold">Wahadle Admin</h1>
          <Link href="/admin/units" className="text-sm text-emerald-400 underline">
            Units
          </Link>
          <Link href="/" className="text-sm text-neutral-400 underline">
            Back to game
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span>{data.user?.email}</span>
          <form action="/admin/login/signout" method="post">
            <button className="underline hover:text-neutral-200" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
