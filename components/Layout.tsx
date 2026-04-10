"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import DateRangePicker from "@/components/DateRangePicker";
import { createClient } from "@/lib/supabase/client";

const MANAGE_NAV = [
  { href: "/projects", label: "Projects", icon: "📁" },
];

const CORE_NAV = [
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/clusters", label: "URL Clusters", icon: "🔗" },
  { href: "/pages", label: "Pages", icon: "📄" },
  { href: "/errors", label: "Errors", icon: "⚠️" },
  { href: "/performance", label: "Performance", icon: "⚡" },
  { href: "/bots", label: "Bots", icon: "🤖" },
];

const GSC_HEALTH_NAV = [
  { href: "/gsc-health/crawl-stats", label: "Crawl Stats", icon: "📈" },
  { href: "/gsc-health/crawl-errors", label: "Crawl Errors", icon: "🔍" },
  { href: "/gsc-health/sitemaps", label: "Sitemaps", icon: "🗺️" },
  { href: "/gsc-health/cwv", label: "Core Web Vitals", icon: "⚙️" },
  { href: "/gsc-health/canonical", label: "Canonical Audit", icon: "🔗" },
  { href: "/gsc-health/404-monitor", label: "404 Monitor", icon: "🚫" },
];

const ADVANCED_NAV = [
  { href: "/redirects", label: "Redirects", icon: "↪️" },
  { href: "/crawl-budget", label: "Crawl Budget", icon: "🕷️" },
  { href: "/checkout", label: "Checkout", icon: "🛒" },
  { href: "/languages", label: "Languages", icon: "🌍" },
  { href: "/heatmap", label: "Heatmap", icon: "🔥" },
  { href: "/schema", label: "Schema", icon: "🏷️" },
];

const COMPETITORS_NAV = [
  { href: "/competitors", label: "Competitor Monitor", icon: "🔍" },
];

type NavItem = { href: string; label: string; icon: string };

function CollapsibleNavSection({
  title,
  items,
  pathname,
  storageKey,
  defaultOpen = true,
  onClick,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  storageKey: string;
  defaultOpen?: boolean;
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const saved = localStorage.getItem(`nav_${storageKey}`);
    if (saved !== null) setOpen(saved === "1");
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(`nav_${storageKey}`, next ? "1" : "0");
  }

  // Auto-expand if current page is in this section
  const isActive = items.some((n) => pathname === n.href || pathname.startsWith(n.href + "/"));

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-400 px-3 mb-1 mt-3 transition-colors"
      >
        <span>{title}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open || isActive ? "rotate-0" : "-rotate-90"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {(open || isActive) && (
        <div>
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={onClick}
              className={`block px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === n.href
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              {n.icon} {n.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NavSection({ title, items, pathname, onClick }: {
  title: string;
  items: NavItem[];
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
          className={`block px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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

  const sidebarContent = (mobileClick?: () => void) => (
    <>
      <NavSection title="Manage" items={MANAGE_NAV} pathname={pathname} onClick={mobileClick} />
      <CollapsibleNavSection title="Core" items={CORE_NAV} pathname={pathname} storageKey="core" defaultOpen={true} onClick={mobileClick} />
      <CollapsibleNavSection title="GSC Health" items={GSC_HEALTH_NAV} pathname={pathname} storageKey="gsc" defaultOpen={false} onClick={mobileClick} />
      <NavSection title="Monitoring" items={COMPETITORS_NAV} pathname={pathname} onClick={mobileClick} />
      <CollapsibleNavSection title="Advanced" items={ADVANCED_NAV} pathname={pathname} storageKey="advanced" defaultOpen={false} onClick={mobileClick} />
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-gray-900 border-r border-gray-800 p-4 flex-col shrink-0 overflow-y-auto">
        <h1 className="text-lg font-bold text-white mb-2 px-2">📊 LogAnalyzer</h1>
        <div className="flex-1">{sidebarContent()}</div>
        <button
          onClick={async () => { await createClient().auth.signOut(); window.location.href = "/login"; }}
          className="mt-4 px-3 py-2 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors w-full text-left"
        >
          ↩ Sign out
        </button>
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

        {menuOpen && (
          <nav className="md:hidden bg-gray-900 border-b border-gray-800 px-4 pb-3 flex flex-col gap-0">
            {sidebarContent(() => setMenuOpen(false))}
          </nav>
        )}

        <DateRangePicker />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
