import type { Metadata, Viewport } from "next";
import "./globals.css";
import { dir } from "@/i18n/dict";
import { getLocale } from "@/i18n/server";
import { SwRegister } from "@/components/layout/sw-register";

export const metadata: Metadata = {
  title: { default: "GSW Property ERP", template: "%s · GSW Property ERP" },
  description: "GLOBAL PROPERTY MANAGEMENT ERP — Global Snow Wing (GSW)",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GSW ERP", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dir(locale)}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-white focus:p-2">
          {locale === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}
        </a>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
