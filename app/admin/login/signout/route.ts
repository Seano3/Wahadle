import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
