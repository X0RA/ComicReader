import FileManager from "@/components/file-manager"

export default function Home() {
  return (
    <main className="max-w-6xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6">File Manager</h1>
      <FileManager />
    </main>
  )
}

