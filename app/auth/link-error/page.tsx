import Link from "next/link";
export default function LinkError() {
  return <main className="mx-auto max-w-lg px-6 py-20"><h1 className="text-3xl font-bold">This link couldn’t be verified</h1><p className="mt-4 text-slate-300">It may have expired, already been used, or opened in a different browser. Try signing in or request a new password reset link.</p><div className="mt-6 flex gap-5 text-orange-300"><Link href="/sign-in">Sign in</Link><Link href="/reset-password">Reset password</Link></div></main>;
}
