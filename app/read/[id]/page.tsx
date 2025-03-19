"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Download, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import FileStorage, { FileType } from "@/lib/indexdb"

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B"
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB"
  else return (bytes / 1073741824).toFixed(1) + " GB"
}

export default function ReadFilePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [file, setFile] = useState<FileType | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadFile = async () => {
      try {
        await FileStorage.init()
        const fileData = await FileStorage.getFile(params.id)
        
        if (!fileData) {
          setError("File not found")
          setIsLoading(false)
          return
        }
        
        setFile(fileData)
        
        // Handle file content based on type
        if (fileData.content) {
          if (fileData.type.startsWith('text/') || 
              fileData.type === 'application/json' ||
              fileData.type === 'application/javascript') {
            // For text files, convert ArrayBuffer to text
            const text = await new Response(fileData.content as ArrayBuffer).text()
            setFileContent(text)
          }
        }
        
        setIsLoading(false)
      } catch (error) {
        console.error('Error loading file:', error)
        setError("Failed to load file")
        setIsLoading(false)
      }
    }
    
    loadFile()
  }, [params.id])

  const downloadFile = () => {
    if (!file) return
    
    const blob = new Blob([file.content as ArrayBuffer], { type: file.type })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    
    // Clean up
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading file...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="text-center py-16">
          <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Error</h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (!file) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="text-center py-16">
          <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">File Not Found</h2>
          <p className="mt-2 text-muted-foreground">The file you're looking for doesn't exist or may have been deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={downloadFile} variant="outline">
          <Download className="mr-2 h-4 w-4" /> Download
        </Button>
      </div>

      <div className="border rounded-lg shadow-sm">
        <div className="border-b p-4 bg-muted/20">
          <h1 className="text-xl font-semibold">{file.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Type: {file.type}</span>
            <span>Size: {formatFileSize(file.size)}</span>
            <span>Created: {file.createdAt.toLocaleString()}</span>
          </div>
        </div>

        <div className="p-4">
          {fileContent ? (
            file.type.startsWith('image/') ? (
              <div className="flex justify-center">
                <img 
                  src={URL.createObjectURL(new Blob([file.content as ArrayBuffer], { type: file.type }))} 
                  alt={file.name} 
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
            ) : file.type.startsWith('text/') || 
                file.type === 'application/json' || 
                file.type === 'application/javascript' ? (
              <pre className="p-4 bg-muted/30 rounded-lg overflow-auto max-h-[60vh]">
                <code>{fileContent}</code>
              </pre>
            ) : (
              <div className="text-center py-10">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                <p className="mt-4">This file type cannot be previewed. Download to view.</p>
              </div>
            )
          ) : (
            <div className="text-center py-10">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
              <p className="mt-4">This file cannot be previewed. Download to view.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
