"use client";
import { useEffect, useState } from "react";
import BackupPage from "@/components/backup-page";
export default function Page() {
  const [token, setToken] = useState<string>();
  useEffect(() => { const read = () => setToken(location.hash.slice(1) || undefined); read(); window.addEventListener("hashchange", read); return () => window.removeEventListener("hashchange", read); }, []);
  return <BackupPage token={token} />;
}
