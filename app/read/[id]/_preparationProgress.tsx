export default function PreparationProgress({ prepared, total }: { prepared: number; total: number }) {
  if (!total || prepared >= total) return null;
  const percent = Math.floor(prepared / total * 100);
  return <span role="progressbar" aria-label="Preparing remaining pages" aria-valuemin={0} aria-valuemax={total} aria-valuenow={prepared}
    title={`${prepared} of ${total} pages ready`} className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
    <span className="hidden sm:inline">Preparing</span>
    <span aria-hidden="true" className="h-1 w-8 overflow-hidden rounded-full bg-secondary"><span className="block h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} /></span>
    <span aria-hidden="true" className="font-mono">{percent}%</span>
  </span>;
}
