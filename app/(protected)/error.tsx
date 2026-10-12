"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return <section role="alert"><h1 className="text-2xl font-bold">We couldn’t load this page</h1><p className="mt-3 text-slate-300">Please try again in a moment.</p><button onClick={() => retry()} className="mt-5 rounded-lg bg-orange-400 px-4 py-2 text-slate-950">Try again</button></section>;
}
