"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, resetPassword, updatePassword, type AuthState } from "@/app/auth/actions";

const settings = {
  "sign-in": { title: "Welcome back", description: "Sign in to your roster planner.", button: "Sign in", action: signIn },
  "sign-up": { title: "Create your account", description: "Start building your personal NBA roster.", button: "Create account", action: signUp },
  "reset-password": { title: "Reset your password", description: "We’ll email you a link to choose a new password.", button: "Send reset link", action: resetPassword },
  "update-password": { title: "Choose a new password", description: "Use at least eight characters.", button: "Save password", action: updatePassword },
};

export function AuthForm({ mode }: { mode: keyof typeof settings }) {
  const config = settings[mode];
  const [emailValue, setEmailValue] = useState("");
  const [state, action, pending] = useActionState<AuthState, FormData>(config.action, {});
  const email = mode !== "update-password";
  const password = mode !== "reset-password";
  const confirmation = mode === "sign-up" || mode === "update-password";
  const input = "mt-2 w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 focus:outline-2 focus:outline-orange-400";
  return <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800/50 p-6 sm:p-8">
    <h1 className="text-3xl font-bold">{config.title}</h1>
    <p className="mt-3 text-slate-300">{config.description}</p>
    <form action={action} className="mt-8 space-y-5">
      {email && <label className="block">Email<input className={input} name="email" type="email" value={emailValue} onChange={event => setEmailValue(event.target.value)} autoComplete="email" required maxLength={254} /></label>}
      {password && <label className="block">Password<input className={input} name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-in" ? undefined : 8} maxLength={128} /></label>}
      {confirmation && <label className="block">Confirm password<input className={input} name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label>}
      {state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-green-300">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-orange-400 px-4 py-3 font-semibold text-slate-950 hover:bg-orange-300 disabled:opacity-60">{pending ? "Please wait…" : config.button}</button>
    </form>
    <nav aria-label="Account options" className="mt-6 flex flex-wrap gap-4 text-sm text-orange-300">
      {mode !== "sign-in" && <Link href="/sign-in">Sign in</Link>}
      {mode === "sign-in" && <><Link href="/sign-up">Create account</Link><Link href="/reset-password">Forgot password?</Link></>}
      {mode === "update-password" && <Link href="/dashboard">Back to dashboard</Link>}
    </nav>
  </section>;
}
