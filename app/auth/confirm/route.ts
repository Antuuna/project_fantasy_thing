import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (token_hash && (type === "email" || type === "recovery")) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/update-password" : "/dashboard", request.url));
    } catch { /* Invalid, expired, or unavailable verification. */ }
  }
  return NextResponse.redirect(new URL("/auth/link-error", request.url));
}
