"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const CORE_NAV = [
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/clusters", label: "URL Clusters", icon: "🔗" },
  { href: "/pages", label: "Pages", icon: "📄" },
  { href: "/errors", label: "Errors", icon: "⚠️" },
  { href: "/performance", label: "Performance", icon: "⚡" },
  { href: "/bots", label: "Bots", icon: "🤖" },
];

const ADVANCED_NAV = [
  { href: "/redirects", label: "Redirects", icon: "↪️" },
  { href: "/crawl-budget", label: "Crawl Budget", icon: "🕷️" },
  { href: "/checkout", label: "Checkout", icon: "🛒" },
  { href: "/languages", label: "Languages", icon: "🌍" },
  { href: "/heatmap", label: "Heatmap", icon: "🔥" },
  { href: "/schema", label: "Schema", icon: "🏷️" },
];

const ALL_NAV = [...CORE_NAV, ...ADVANCED_NAV];

function NavSection({ title, items, pathname, onClick }: {
  title: string;
  items: typeof CORE_NAV;
  pathname: string;
  onClick?: () => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 px-3 mb-1 mt-3">{title}</div>
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={onClick}
          className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname === n.href
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          }`}
        >
          {n.icon} {n.label}
        </Link>
      ))}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-gray-900 border-r border-gray-800 p-4 flex-col gap-0 shrink-0">
        <h1 className="text-lg font-bold text-white mb-2 px-2">📊 LogAnalyzer</h1>
        <NavSection title="Core" items={CORE_NAV} pathname={pathname} />
        <NavSection title="Advanced" items={ADVANCED_NAV} pathname={pathname} />
      </aside>

      {/* Mobile header + hamburger */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between bg-gray-900 border-b border-gray-800 px-4 py-3">
          <h1 className="text-base font-bold text-white">📊 LogAnalyzer</h1>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-gray-300 hover:text-white p-1"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </header>

        {/* Mobile dropdown nav */}
        {menuOpen && (
          <nav className="md:hidden bg-gray-900 border-b border-gray-800 px-4 pb-3 flex flex-col gap-0">
            <NavSection title="Core" items={CORE_NAV} pathname={pathname} onClick={() => setMenuOpen(false)} />
            <NavSection title="Advanced" items={ADVANCED_NAV} pathname={pathname} onClick={() => setMenuOpen(false)} />
          </nav>
        )}

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
