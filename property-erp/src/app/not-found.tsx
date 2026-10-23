import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-xl font-bold text-navy-900">404</h1>
        <p className="mt-2 text-sm text-muted">الصفحة غير موجودة / Page not found</p>
        <Link href="/" className="btn-primary mt-4">
          الرئيسية / Home
        </Link>
      </div>
    </div>
  );
}
