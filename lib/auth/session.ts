import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function requireUser() {
  if (!hasSupabaseConfig()) redirect("/sign-in");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) redirect("/sign-in");
  return { supabase, claims: data.claims };
}
