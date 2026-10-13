export function ChartDot({ color }: { color?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
