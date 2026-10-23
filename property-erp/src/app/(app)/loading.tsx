export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 rounded bg-navy-100" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-[14px] bg-white" />
        ))}
      </div>
      <div className="h-72 rounded-[14px] bg-white" />
    </div>
  );
}
