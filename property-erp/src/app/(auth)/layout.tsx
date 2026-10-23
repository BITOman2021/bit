import { toggleLocaleAction } from "@/app/actions/auth";
import { getT } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="flex min-h-dvh flex-col bg-navy-900 bg-[radial-gradient(circle_at_20%_10%,rgba(200,162,74,0.18),transparent_40%),radial-gradient(circle_at_90%_90%,rgba(38,80,138,0.5),transparent_45%)]">
      <div className="flex justify-end p-4">
        <form action={toggleLocaleAction}>
          <button className="rounded-lg px-3 py-1.5 text-sm text-gold-300 hover:bg-white/10" type="submit">
            {t.common.language}
          </button>
        </form>
      </div>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500 text-lg font-black text-navy-950 shadow-lg">GSW</div>
            <h1 className="text-xl font-bold text-white">{t.app.name}</h1>
            <p className="text-sm text-gold-300">{t.app.company}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
