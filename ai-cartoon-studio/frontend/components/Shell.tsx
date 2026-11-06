"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, Clapperboard, FileText, FolderKanban, Image as ImageIcon, LayoutDashboard, LogOut, Menu, Mic, Moon, Settings, Shield, Sparkles, Sun, UserSquare2, Users, Video, Wand2, Youtube, Film, Languages, Star } from "lucide-react";
import { useApp } from "@/lib/app";
import { Spinner } from "./ui";

export function Shell({ children }: { children: React.ReactNode }) {
  const { tr, user, ready, lang, setLang, theme, setTheme, logout } = useApp();
  const path = usePathname(); const router = useRouter(); const [open, setOpen] = useState(false);
  useEffect(() => { if (ready && !user) router.replace("/login"); }, [ready, user, router]);
  useEffect(() => setOpen(false), [path]);
  if (!ready || !user) return <div className="flex h-screen items-center justify-center"><Spinner s={28} /></div>;
  const nav = [
    ["/dashboard", LayoutDashboard, tr("لوحة التحكم", "Dashboard")], ["/projects", FolderKanban, tr("المشاريع", "Projects")],
    ["/image", ImageIcon, tr("استوديو الصور", "Image Studio")], ["/characters", UserSquare2, tr("منشئ الشخصيات", "Character Creator")],
    ["/story", FileText, tr("القصة والسيناريو", "Story & Script")], ["/voice", Mic, tr("استوديو الصوت", "Voice Studio")],
    ["/video", Video, tr("استوديو الفيديو", "Video Studio")], ["/lipsync", Wand2, tr("التحريك والمزامنة", "Lip Sync & Animation")],
    ["/editor", Clapperboard, tr("محرر الفيديو", "Video Editor")], ["/youtube", Youtube, tr("استوديو يوتيوب", "YouTube Studio")],
    ["/library/characters", Users, tr("مكتبة الشخصيات", "Character Library")], ["/library/assets", Boxes, tr("مكتبة الملفات", "Assets Library")],
    ["/samkidz", Star, "SAM KIDZ | سام كيدز"], ["/settings", Settings, tr("الإعدادات", "Settings")],
    ...(user.role === "admin" ? [["/admin", Shield, tr("الإدارة", "Admin")]] : []),
  ] as [string, any, string][];
  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 start-0 z-30 w-64 overflow-y-auto border-e border-line bg-panel p-4 transition-transform md:static md:ltr:translate-x-0 md:rtl:translate-x-0 ${open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"}`}>
        <Link href="/dashboard" className="mb-5 flex items-center gap-2 text-lg font-extrabold"><Sparkles className="text-brand" />AI Cartoon Studio</Link>
        <nav className="flex flex-col gap-1">
          {nav.map(([href, Icon, label]) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${path.startsWith(href) ? "bg-gradient-to-r from-brand/20 to-brand2/20 text-brand" : "text-mute hover:bg-panel2 hover:text-ink"}`}>
              <Icon size={18} />{label}
            </Link>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur">
          <button className="btn-ghost md:hidden" onClick={() => setOpen(true)} aria-label="menu"><Menu size={18} /></button>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => setLang(lang === "ar" ? "en" : "ar")}><Languages size={16} />{lang === "ar" ? "English" : "العربية"}</button>
          <button className="btn-ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="theme">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
          <span className="hidden text-sm text-mute sm:block">{user.name || user.email}</span>
          <button className="btn-ghost" onClick={logout} aria-label="logout"><LogOut size={16} /></button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
