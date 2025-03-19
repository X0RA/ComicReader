"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Download, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import FileStorage, { FileType } from "@/lib/indexdb"

// Import the view components
import TextView from "../file_views/TextView"
import ImageView from "../file_views/ImageView"
import ComicView from "../file_views/ComicView"

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B"
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB"
  else return (bytes / 1073741824).toFixed(1) + " GB"
}

export default function ReadFilePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [file, setFile] = useState<FileType | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isArchive, setIsArchive] = useState(false)
  const [isImage, setIsImage] = useState(false)
  const [isText, setIsText] = useState(false)

  const [unwrappedParams, setUnwrappedParams] = useState<{ id: string } | null>(null);

  useEffect(() => {
    params.then(setUnwrappedParams);
  }, [params]);

  useEffect(() => {
    const loadFile = async () => {
      if (!unwrappedParams?.id) return; // Ensure params.id is available

      try {
        await FileStorage.init();
        const fileData = await FileStorage.getFile(unwrappedParams.id);

        if (!fileData) {
          setError("File not found");
          setIsLoading(false);
          return;
        }

        setFile(fileData);

        const fileExtension = fileData.name.split('.').pop()?.toLowerCase();

        // Determine file type
        if (fileExtension === 'zip' || fileExtension === 'cbz') {
          setIsArchive(true);
        } else if (fileData.type && fileData.type.startsWith('image/')) {
          setIsImage(true);
        } else if (fileData.type && (
            fileData.type.startsWith('text/') || 
            fileData.type === 'application/json' ||
            fileData.type === 'application/javascript')) {
          setIsText(true);
          // Convert ArrayBuffer to text
          const text = await new Response(fileData.content as ArrayBuffer).text();
          setFileContent(text);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading file:', error);
        setError("Failed to load file");
        setIsLoading(false);
      }
    };

    loadFile();
  }, [unwrappedParams]); // Update dependency to unwrappedParams

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

  // Determine which viewer component to use
  const renderFileViewer = () => {
    if (isArchive) {
      return <ComicView file={file} />;
    } else if (isImage) {
      return <ImageView file={file} />;
    } else if (isText && fileContent) {
      return <TextView file={file} fileContent={fileContent} />;
    } else {
      return (
        <div className="p-4">
          <div className="text-center py-10">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
            <p className="mt-4">This file cannot be previewed. Download to view.</p>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="border rounded-lg shadow-sm">
        {/* header */}
        <div className="border-b p-4 bg-muted/20 relative">
          <Button variant="ghost" onClick={() => router.back()} className="absolute left-4 top-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={downloadFile} variant="outline" className="absolute right-4 top-4">
            <Download className="mr-2 h-4 w-4" /> Download
          </Button>
          <div className="text-center pt-10">
            <h1 className="text-xl font-semibold">{file.name}</h1>
            <div className="flex items-center justify-center gap-4 mt-2 text-sm text-muted-foreground">
              <span>Type: {file.type}</span>
              <span>Size: {formatFileSize(file.size)}</span>
              <span>Created: {file.createdAt.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {renderFileViewer()}
      </div>
    </div>
  )
}
