"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return <section role="alert"><h1 className="text-2xl font-bold">We couldn’t load this page</h1><p className="mt-2 muted">Please try again in a moment.</p><button onClick={() => retry()} className="btn-primary mt-5">Try again</button></section>;
}
