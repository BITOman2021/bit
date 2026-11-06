"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

export type User = { id: number; email: string; name: string; role: string; lang: "ar" | "en"; theme: "dark" | "light" };
type Ctx = {
  lang: "ar" | "en"; theme: "dark" | "light"; user: User | null; ready: boolean;
  /** tr(arabic, english): every visible string carries both languages side by side. */
  tr: (ar: string, en: string) => string;
  setLang: (l: "ar" | "en") => void; setTheme: (t: "dark" | "light") => void;
  login: (token: string, u: User) => void; logout: () => Promise<void>;
  toast: (msg: string, kind?: "ok" | "err") => void; toasts: { id: number; msg: string; kind: string }[];
};
const C = createContext<Ctx>(null as never);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, _l] = useState<"ar" | "en">("ar");
  const [theme, _t] = useState<"dark" | "light">("dark");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Ctx["toasts"]>([]);

  const applyLang = (l: "ar" | "en") => { document.documentElement.lang = l; document.documentElement.dir = l === "ar" ? "rtl" : "ltr"; };
  const applyTheme = (t: "dark" | "light") => document.documentElement.classList.toggle("dark", t === "dark");
  useEffect(() => {
    const l = (localStorage.getItem("acs_lang") as "ar" | "en") || "ar"; const t = (localStorage.getItem("acs_theme") as "dark" | "light") || "dark";
    _l(l); _t(t); applyLang(l); applyTheme(t);
    if (getToken()) api.get("/auth/me").then((u) => { setUser(u); }).catch(() => setToken("")).finally(() => setReady(true)); else setReady(true);
  }, []);
  const setLang = (l: "ar" | "en") => { _l(l); localStorage.setItem("acs_lang", l); applyLang(l); if (user) api.patch("/auth/me", { lang: l }).catch(() => {}); };
  const setTheme = (t: "dark" | "light") => { _t(t); localStorage.setItem("acs_theme", t); applyTheme(t); if (user) api.patch("/auth/me", { theme: t }).catch(() => {}); };
  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random(); setToasts((x) => [...x, { id, msg, kind }]); setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 5000);
  }, []);
  const login = (token: string, u: User) => { setToken(token); setUser(u); };
  const logout = async () => { try { await api.post("/auth/logout"); } catch {} setToken(""); setUser(null); window.location.href = "/login"; };
  return <C.Provider value={{ lang, theme, user, ready, tr: (ar, en) => (lang === "ar" ? ar : en), setLang, setTheme, login, logout, toast, toasts }}>{children}</C.Provider>;
}
