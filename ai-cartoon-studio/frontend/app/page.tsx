"use client";
import Link from "next/link";
import { Clapperboard, ImageIcon, Languages, Mic, Sparkles, Video, Youtube, Cpu, Wand2 } from "lucide-react";
import { useApp } from "@/lib/app";

export default function Landing() {
  const { tr, lang, setLang, user } = useApp();
  const feats = [
    [ImageIcon, tr("صور وشخصيات كرتونية", "Cartoon images & characters"), tr("2D و3D وأنمي مع ثبات الشخصية بين المشاهد.", "2D, 3D and anime with character consistency across scenes.")],
    [Mic, tr("أصوات الشخصيات", "Character voices"), tr("TTS عربي وإنجليزي بمحركات مجانية ومحلية.", "Arabic & English TTS with free local engines.")],
    [Wand2, tr("تحريك الصور", "Animation"), tr("حركة كاميرا وتحريك صوتي للشخصيات.", "Camera motion and audio-driven character animation.")],
    [Video, tr("إنتاج الفيديو", "Video production"), tr("مونتاج بمحرر Timeline وتصدير 16:9 و9:16 و1:1.", "Timeline editor, export 16:9, 9:16 and 1:1.")],
    [Youtube, tr("جاهز لليوتيوب", "YouTube ready"), tr("عناوين، وصف، ترجمة SRT وصورة مصغرة بالعربية.", "Titles, descriptions, SRT subtitles and Arabic thumbnails.")],
    [Cpu, tr("مجاني أولاً", "Free-first"), tr("محركات مفتوحة المصدر تعمل على جهازك، بلا اشتراك إلزامي.", "Open-source engines on your own hardware. No mandatory subscription.")],
  ] as const;
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-5">
        <b className="flex items-center gap-2 text-lg"><Sparkles className="text-brand" />AI Cartoon Studio</b>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setLang(lang === "ar" ? "en" : "ar")}><Languages size={16} />{lang === "ar" ? "English" : "العربية"}</button>
          <Link className="btn-primary" href={user ? "/dashboard" : "/login"}>{user ? tr("لوحة التحكم", "Dashboard") : tr("ابدأ الآن", "Get started")}</Link>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <h1 className="bg-gradient-to-r from-brand to-brand2 bg-clip-text text-4xl font-black leading-tight text-transparent md:text-6xl">{tr("من الفكرة إلى فيديو كرتوني كامل", "From an idea to a full cartoon video")}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-mute">{tr("منصة متكاملة لصناعة القصص والشخصيات والحلقات الكرتونية وتجهيزها للنشر على يوتيوب.", "An all-in-one platform for stories, characters and cartoon episodes, ready for YouTube.")}</p>
        <Link href="/login" className="btn-primary mt-8 !px-8 !py-3 text-base">{tr("أنشئ حسابك", "Create your account")}</Link>
        <p className="mt-4 text-xs text-mute">{tr("يتطلب توليد الصور والفيديو بالذكاء الاصطناعي تشغيل ComfyUI على جهازك أو خادم GPU. ", "AI image/video generation needs ComfyUI on your machine or a GPU server. ")}</p>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 p-5 md:grid-cols-3">
        {feats.map(([Icon, t, d]) => <div key={t} className="card p-5"><Icon className="mb-3 text-brand" /><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm text-mute">{d}</p></div>)}
      </section>
    </div>
  );
}
