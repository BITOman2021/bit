import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-md p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-xl text-danger">!</div>
        <h1 className="text-lg font-bold text-navy-900">ليست لديك صلاحية / Access denied</h1>
        <p className="mt-2 text-sm text-muted">لا تملك صلاحية الوصول إلى هذه الصفحة أو السجل. / You are not allowed to access this page or record.</p>
        <Link href="/" className="btn-primary mt-4">
          الرئيسية / Home
        </Link>
      </div>
    </div>
  );
}
