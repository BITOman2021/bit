import "./globals.css";
import type { Metadata } from "next";
import { AppProvider } from "@/lib/app";
import { Toasts } from "@/components/ui";

export const metadata: Metadata = { title: "AI Cartoon Studio | استوديو الكرتون بالذكاء الاصطناعي", description: "Create cartoon images, characters, stories and videos." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body><AppProvider>{children}<Toasts /></AppProvider></body>
    </html>
  );
}
