"use client";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { ThemeSwitcher } from "./theme-controls";
import BackupPanel from "./backup-panel";
export default function BackupPage({ token }: { token?: string }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-[880px] flex-col gap-7 px-5 pt-7 pb-16 sm:px-6">
    <header className="flex items-center justify-between gap-3"><nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-medium"><Link href="/" aria-label="Library" className="-ml-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"><BookOpen size={18} /></Link><ChevronRight size={12} className="text-muted-foreground" /><span aria-current="page">Backup & transfer</span></nav><ThemeSwitcher /></header>
    <h1 className="text-[32px] font-semibold tracking-tight">Backup & transfer</h1><BackupPanel automaticToken={token} />
  </main>;
}
