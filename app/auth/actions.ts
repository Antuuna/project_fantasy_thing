"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { requireUser } from "@/lib/auth/session";

export type AuthState = { error?: string; message?: string };
function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
function credentials(form: FormData) {
  return { email: field(form, "email").trim(), password: field(form, "password") };
}
function emailValid(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function passwordError(password: string, confirmation: string) {
  if (password.length < 8 || password.length > 128) return "Use a password between 8 and 128 characters.";
  if (password !== confirmation) return "Passwords do not match.";
}
function appUrl() {
  const value = process.env.APP_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  if (!value) throw new Error("Set APP_URL for authentication email redirects.");
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("APP_URL must be an HTTP(S) URL.");
  return url.origin;
}
const unavailable = { error: "Authentication is not configured yet. Please try again later." };

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) return unavailable;
  const { email, password } = credentials(form);
  if (!emailValid(email) || !password || password.length > 128) return { error: "Enter a valid email and password." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "Unable to sign in. Check your credentials and confirm your email if required." };
  } catch { return { error: "Unable to reach authentication. Please try again." }; }
  redirect("/dashboard");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) return unavailable;
  const { email, password } = credentials(form);
  const error = passwordError(password, field(form, "confirmation"));
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  if (error) return { error };
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${appUrl()}/auth/callback` } });
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Supabase registration rejected", { code: error.code ?? "unknown", status: error.status });
      }
      const messages: Record<string, string> = {
        over_email_send_rate_limit: "The email sending limit has been reached. Please try again later.",
        over_request_rate_limit: "Too many registration attempts. Please try again later.",
        signup_disabled: "New account registration is disabled for this project.",
        email_provider_disabled: "Email registration is disabled for this project.",
        email_address_not_authorized: "This project’s email service cannot send to this address yet. Contact the project administrator.",
        email_address_invalid: "Supabase rejected this email address. Please use a valid email address.",
        weak_password: "Your password does not meet this project’s strength requirements. Please choose a stronger password.",
        captcha_failed: "This project requires CAPTCHA verification, which is not configured in this app yet.",
      };
      return { error: messages[error.code ?? ""] ?? "Unable to create an account. Please try again or sign in if you already have one." };
    }
    signedIn = Boolean(data.session);
  } catch { return { error: "Unable to complete registration. Please try again." }; }
  if (signedIn) redirect("/dashboard");
  return { message: "Check your email for a confirmation link, then sign in. If you already have an account, use sign-in or password reset." };
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) return unavailable;
  const email = field(form, "email").trim();
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/auth/callback?next=/update-password` });
    if (error) return { error: "Unable to send a reset email right now. Please try again later." };
  } catch { return { error: "Unable to reach authentication. Please try again." }; }
  return { message: "If an account exists for this email, you will receive a password reset link." };
}

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const { supabase } = await requireUser();
  const password = field(form, "password");
  const error = passwordError(password, field(form, "confirmation"));
  if (error) return { error };
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: "Unable to update your password. Use a different password or request a new reset link." };
  } catch { return { error: "Unable to reach authentication. Please try again." }; }
  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/dashboard?signout=failed");
  redirect("/sign-in");
}
