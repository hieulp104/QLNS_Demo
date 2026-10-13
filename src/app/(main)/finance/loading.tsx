export default function FinanceLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-16 rounded-xl bg-surface-subtle" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-24 rounded-xl border border-line bg-surface"
          />
        ))}
      </div>
      <div className="h-40 rounded-xl border border-line bg-surface" />
      <div className="h-96 rounded-xl border border-line bg-surface" />
    </div>
  );
}
