import BackupPage from "@/components/backup-page";
export default async function Page({ params }: { params: Promise<{ payload: string }> }) {
  const { payload } = await params;
  return <BackupPage token={payload} />;
}
