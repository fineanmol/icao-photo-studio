"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/studio", label: "Passport Studio", icon: "🪪" },
  { href: "/bg-remover", label: "Background Remover", icon: "✨" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-800 text-amber-400 text-sm font-bold shadow-sm">
            ID
          </span>
          <span className="hidden font-bold tracking-tight sm:block">ICAO Photo Studio</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span>{icon}</span>
                <span className="hidden sm:block">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
