"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = /FORBIDDEN|صلاحية/.test(error.message);
  const notFound = /NOT_FOUND|غير موجود/.test(error.message);
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <h2 className="text-lg font-bold text-navy-900">
        {forbidden ? "ليست لديك صلاحية / Access denied" : notFound ? "السجل غير موجود / Not found" : "حدث خطأ / Something went wrong"}
      </h2>
      <p className="mt-2 text-sm text-muted">{forbidden || notFound ? error.message : "يرجى المحاولة مرة أخرى / Please try again"}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">ref: {error.digest}</p>}
      <button className="btn-primary mt-4" onClick={reset}>
        إعادة المحاولة / Retry
      </button>
    </div>
  );
}
