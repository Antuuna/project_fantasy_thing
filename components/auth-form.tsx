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
  return <section className="card w-full max-w-md border-t-4 border-t-brand p-6 sm:p-8">
    <h1 className="page-title">{config.title}</h1>
    <p className="mt-2 muted">{config.description}</p>
    <form action={action} className="mt-7 space-y-5">
      {email && <label className="label">Email<input className="field font-normal" name="email" type="email" value={emailValue} onChange={event => setEmailValue(event.target.value)} autoComplete="email" required maxLength={254} /></label>}
      {password && <label className="label">Password<input className="field font-normal" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-in" ? undefined : 8} maxLength={128} /></label>}
      {confirmation && <label className="label">Confirm password<input className="field font-normal" name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label>}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-success">{state.message}</p>}
      <button disabled={pending} className="btn-primary btn-lg w-full">{pending ? "Please wait…" : config.button}</button>
    </form>
    <nav aria-label="Account options" className="mt-6 flex flex-wrap gap-4 border-t border-line pt-5 text-sm">
      {mode !== "sign-in" && <Link className="link" href="/sign-in">Sign in</Link>}
      {mode === "sign-in" && <><Link className="link" href="/sign-up">Create account</Link><Link className="link" href="/reset-password">Forgot password?</Link></>}
      {mode === "update-password" && <Link className="link" href="/dashboard">Back to dashboard</Link>}
    </nav>
  </section>;
}
