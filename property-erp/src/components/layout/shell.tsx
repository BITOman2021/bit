"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell, BookOpen, Boxes, Building2, CalendarClock, ChartColumn, ChevronsLeft, ChevronsRight, ClipboardList, DoorOpen, Ellipsis, FileText, FolderOpen,
  HardHat, Hourglass, House, Landmark, Languages, ListChecks, LogOut, Menu, Package, PiggyBank, Receipt, ScrollText, Settings, ShieldCheck, Sparkles,
  SquareCheck, Truck, UserCog, UserRound, Users, Wallet, Banknote, Wrench, WifiOff, X, type LucideIcon,
} from "lucide-react";
import type { NavGroup } from "./nav-config";

const ICONS: Record<string, LucideIcon> = {
  dashboard: House, approvals: SquareCheck, tasks: ListChecks, building: Building2, door: DoorOpen, owner: UserRound, users: Users, lease: FileText,
  receipt: Receipt, hourglass: Hourglass, piggy: PiggyBank, wallet: Wallet, banknote: Banknote, book: BookOpen, list: ClipboardList, bank: Landmark,
  wrench: Wrench, hardhat: HardHat, calendar: CalendarClock, boxes: Boxes, truck: Truck, package: Package, folder: FolderOpen, chart: ChartColumn,
  sparkles: Sparkles, usercog: UserCog, shield: ShieldCheck, scroll: ScrollText, settings: Settings, clock: CalendarClock,
};

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export interface ShellProps {
  nav: NavGroup[];
  children: ReactNode;
  user: { name: string; role: string };
  labels: { logout: string; language: string; notifications: string; more: string; collapse: string; offline: string; account: string; appName: string; company: string };
  unread: number;
  logoutAction: () => Promise<void>;
  toggleLocaleAction: () => Promise<void>;
  mobileItems: string[];
}

export function AppShell({ nav, children, user, labels, unread, logoutAction, toggleLocaleAction, mobileItems }: ShellProps) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("gsw.sidebar") === "1");
    } catch {}
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => setDrawer(false), [path]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("gsw.sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const all = nav.flatMap((g) => g.items);
  const bottom = mobileItems.map((h) => all.find((i) => i.href === h)).filter(Boolean) as typeof all;

  const NavList = ({ compact }: { compact: boolean }) => (
    <nav aria-label="main" className="flex-1 overflow-y-auto px-2 py-3">
      {nav.map((g, gi) => (
        <div key={gi} className="mb-3">
          {g.label && !compact && <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-gold-300/80">{g.label}</div>}
          {g.label && compact && <div className="mx-3 my-2 border-t border-white/10" />}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const Icon = ICONS[i.icon] ?? FileText;
              const active = isActive(path, i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    title={compact ? i.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--color-gold-500)] rtl:shadow-[inset_-3px_0_0_var(--color-gold-500)]" : "text-navy-100/80 hover:bg-white/5 hover:text-white"}`}
                  >
                    <Icon size={18} aria-hidden className={active ? "text-gold-500" : ""} />
                    {!compact && <span className="flex-1 truncate">{i.label}</span>}
                    {!compact && !!i.badge && <span className="rounded-full bg-gold-500 px-1.5 text-xs font-bold text-navy-950">{i.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const Brand = ({ compact }: { compact: boolean }) => (
    <Link href="/" className="flex items-center gap-3 px-4 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-500 text-sm font-black text-navy-950">GSW</span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold text-white">{labels.appName}</span>
          <span className="block truncate text-[11px] text-gold-300">{labels.company}</span>
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex min-h-dvh">
      {/* القائمة الجانبية — شاشات كبيرة */}
      <aside className={`sticky top-0 hidden h-dvh shrink-0 flex-col bg-navy-900 transition-[width] lg:flex ${collapsed ? "w-[72px]" : "w-64"}`}>
        <Brand compact={collapsed} />
        <NavList compact={collapsed} />
        <button onClick={toggle} className="m-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-navy-100/70 hover:bg-white/5" aria-label={labels.collapse}>
          {collapsed ? <ChevronsRight size={16} className="rtl:rotate-180" /> : <ChevronsLeft size={16} className="rtl:rotate-180" />}
          {!collapsed && labels.collapse}
        </button>
      </aside>

      {/* درج الهاتف */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-navy-900 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand compact={false} />
              <button onClick={() => setDrawer(false)} className="me-3 rounded-lg p-2 text-white hover:bg-white/10" aria-label={labels.collapse}>
                <X size={20} />
              </button>
            </div>
            <NavList compact={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-header no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-white/95 px-3 py-2 backdrop-blur sm:px-5">
          <button className="rounded-lg p-2 text-navy-900 hover:bg-navy-50 lg:hidden" onClick={() => setDrawer(true)} aria-label="menu">
            <Menu size={22} />
          </button>
          <div className="min-w-0 flex-1" />
          <form action={toggleLocaleAction}>
            <button className="btn-ghost btn-sm" type="submit" aria-label="language">
              <Languages size={16} /> {labels.language}
            </button>
          </form>
          <Link href="/notifications" className="relative rounded-lg p-2 text-navy-900 hover:bg-navy-50" aria-label={labels.notifications}>
            <Bell size={20} />
            {unread > 0 && <span className="absolute -top-0.5 end-0 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <Link href="/account" className="hidden items-center gap-2 rounded-lg px-2 py-1 hover:bg-navy-50 sm:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-sm font-bold text-navy-900">{user.name.slice(0, 1)}</span>
            <span className="leading-tight">
              <span className="block max-w-[160px] truncate text-sm font-semibold">{user.name}</span>
              <span className="block text-[11px] text-muted">{user.role}</span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button className="rounded-lg p-2 text-navy-900 hover:bg-navy-50" type="submit" aria-label={labels.logout} title={labels.logout}>
              <LogOut size={20} className="rtl:rotate-180" />
            </button>
          </form>
        </header>
        {!online && (
          <div role="status" className="no-print flex items-center gap-2 bg-warning-bg px-4 py-2 text-sm text-warning">
            <WifiOff size={16} /> {labels.offline}
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-5 pb-24 sm:px-6 lg:pb-8">
          {children}
        </main>
      </div>

      {/* شريط التنقل السفلي — الهاتف */}
      <nav className="bottom-nav no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="bottom">
        {bottom.slice(0, 4).map((i) => {
          const Icon = ICONS[i.icon] ?? FileText;
          const active = isActive(path, i.href);
          return (
            <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-bold text-navy-900" : "text-muted"}`}>
              <Icon size={20} className={active ? "text-gold-600" : ""} aria-hidden />
              <span className="max-w-full truncate px-1">{i.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted">
          <Ellipsis size={20} aria-hidden />
          {labels.more}
        </button>
      </nav>
    </div>
  );
}
