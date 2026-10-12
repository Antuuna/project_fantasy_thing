"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname().startsWith(href);
  return <Link href={href} aria-current={active ? "page" : undefined}
    className={`border-b-[3px] py-3 font-display sm:py-4 text-sm font-bold uppercase tracking-wide transition-colors ${active ? "border-brand text-white" : "border-transparent text-neutral-300 hover:text-white"}`}>
    {children}
  </Link>;
}
