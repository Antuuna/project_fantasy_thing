"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { requireUser } from "@/lib/auth/session";
import { requestSignup, requestRecovery } from '@/lib/auth/requests';

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
  let state: AuthState = {};
  try {
    const supabase = await createClient();
    const result = await requestSignup(supabase.auth.signUp.bind(supabase.auth),email,password,`${appUrl()}/auth/callback`);
    signedIn = result.signedIn;
    state = result.state;
  } catch { return { error: "Unable to complete registration. Please try again." }; }
  if (signedIn) redirect("/dashboard");
  return state;
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) return unavailable;
  const email = field(form, "email").trim();
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  try {
    const supabase = await createClient();
    return await requestRecovery(supabase.auth.resetPasswordForEmail.bind(supabase.auth),email,`${appUrl()}/auth/callback?next=/update-password`);
  } catch { return { error: "Unable to reach authentication. Please try again." }; }
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
