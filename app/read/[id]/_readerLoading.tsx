import { BookOpen } from "lucide-react";
import styles from "./reader.module.css";

export default function ReaderLoading({ phase, progress }: { phase: string; progress: number }) {
  // The storage manager reports bytes when Content-Length is available.
  const determinate = progress > 0;
  const value = Math.min(100, Math.max(0, Math.round(progress)));
  return <section aria-label="Opening comic" className="flex w-full max-w-xs flex-col items-center text-center">
    <div aria-hidden="true" className="relative mb-7 flex size-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 text-primary">
      <BookOpen size={32} strokeWidth={1.4} className={styles.loadingBook} />
      <span className="absolute -bottom-1 size-2 rounded-full bg-primary" />
    </div>
    <h2 className="text-lg font-medium tracking-tight">Getting your comic ready</h2>
    <p role="status" className="mt-2 text-sm text-muted-foreground">{phase}</p>
    <div role="progressbar" aria-label={phase} aria-valuemin={0} aria-valuemax={100} aria-valuenow={determinate ? value : undefined} className="mt-7 h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className={determinate ? "h-full rounded-full bg-primary transition-[width] duration-300" : `${styles.loadingTrack} h-full w-1/3 rounded-full bg-primary`} style={determinate ? { width: `${value}%` } : undefined} />
    </div>
    <p className="mt-3 min-h-4 font-mono text-[11px] text-muted-foreground">{determinate ? `${value}%` : "Just a moment"}</p>
  </section>;
}
