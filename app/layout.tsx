import type { Metadata } from "next";
import { Roboto, Roboto_Condensed } from "next/font/google";
import "./globals.css";

const body = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-body" });
const display = Roboto_Condensed({ subsets: ["latin"], weight: ["700"], variable: "--font-display-face" });

export const metadata: Metadata = {
  title: "Fantasy Basketball Roster Planner",
  description: "Build a personal roster and plan historical NBA lineups.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${body.variable} ${display.variable}`}><body>{children}</body></html>;
}
