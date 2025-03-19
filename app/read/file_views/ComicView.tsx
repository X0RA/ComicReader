import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Home } from "lucide-react";
import { FileType } from "@/lib/indexdb";
import JSZip from "jszip";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FileStorage from "@/lib/indexdb";

interface ComicViewProps {
  file: FileType;
}

export default function ComicView({ file }: ComicViewProps) {
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [siblingFiles, setSiblingFiles] = useState<FileType[]>([]);
  const [prevFileId, setPrevFileId] = useState<string | null>(null);
  const [nextFileId, setNextFileId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const toggleOverlay = () => {
    setShowOverlay(prev => !prev);
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const scrollToBottom = () => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });
  };

  // New function to navigate to another file
  const navigateToFile = (fileId: string) => {
    router.push(`/read/${fileId}`);
  };

  // Find sibling files in the same folder
  useEffect(() => {
    const loadSiblingFiles = async () => {
      try {
        // Initialize the database if needed
        await FileStorage.init();
        
        // Get all files in the same folder
        const filesInFolder = await FileStorage.getFilesInFolder(file.folderId);
        
        // Sort files by name
        const sortedFiles = filesInFolder.sort((a, b) => a.name.localeCompare(b.name));
        setSiblingFiles(sortedFiles);
        
        // Find current file index
        const currentIndex = sortedFiles.findIndex(f => f.id === file.id);
        
        // Determine previous and next file IDs
        if (currentIndex > 0) {
          setPrevFileId(sortedFiles[currentIndex - 1].id);
        } else {
          setPrevFileId(null);
        }
        
        if (currentIndex < sortedFiles.length - 1) {
          setNextFileId(sortedFiles[currentIndex + 1].id);
        } else {
          setNextFileId(null);
        }
      } catch (err) {
        console.error("Error loading sibling files:", err);
      }
    };
    
    loadSiblingFiles();
  }, [file.id, file.folderId]);

  useEffect(() => {
    const extractComicImages = async () => {
      try {
        setLoading(true);
        const zip = new JSZip();
        const contents = await zip.loadAsync(file.content as ArrayBuffer);
        
        const imageFiles: { name: string; url: string }[] = [];
        
        // Process zip entries
        const entries = Object.keys(contents.files).filter(
          name => !contents.files[name].dir && 
          /\.(jpe?g|png|gif|webp)$/i.test(name)
        ).sort();
        
        // Extract images sequentially
        for (const filename of entries) {
          const data = await contents.files[filename].async("blob");
          const url = URL.createObjectURL(data);
          imageFiles.push({ name: filename, url });
        }
        
        setImages(imageFiles);
        setLoading(false);
      } catch (err) {
        console.error("Error extracting comic:", err);
        setError("Failed to extract comic images");
        setLoading(false);
      }
    };
    
    extractComicImages();
    
    // Cleanup URLs on unmount
    return () => {
      images.forEach(img => URL.revokeObjectURL(img.url));
    };
  }, [file]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Extracting comic...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="p-8 text-center">
        <p>No images found in this comic file.</p>
      </div>
    );
  }

  return (
    <div 
      className="comic-container overflow-y-auto p-4 relative"
      onClick={toggleOverlay}
    >
      {showOverlay && (
        <div className="fixed bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm z-50 p-2 md:p-4 rounded-t-xl shadow-lg transition-all duration-300 ease-in-out">
          <div className="flex flex-col items-center justify-between gap-2 max-w-4xl mx-auto">
            <div className="flex items-center justify-between w-full">
              <Button 
                variant="outline"
                size="sm"
                className="bg-background/90 hover:bg-background"
                disabled={!prevFileId}
                onClick={(e) => {
                  e.stopPropagation();
                  if (prevFileId) navigateToFile(prevFileId);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Previous</span>
              </Button>
              
              <div className="px-2 py-1 bg-background/90 rounded-md flex-grow text-center mx-2">
                <p className="text-xs md:text-sm font-medium truncate">{file.name}</p>
              </div>
              
              <Button 
                variant="outline"
                size="sm"
                className="bg-background/90 hover:bg-background"
                disabled={!nextFileId}
                onClick={(e) => {
                  e.stopPropagation();
                  if (nextFileId) navigateToFile(nextFileId);
                }}
              >
                <ArrowRight className="h-4 w-4" />
                <span className="sr-only">Next</span>
              </Button>
            </div>
            
            <div className="flex gap-2 w-full justify-center mt-2">
              <Link href="/">
                <Button variant="outline" size="sm" className="bg-background/90 hover:bg-background">
                  <Home className="h-4 w-4" />
                  <span className="sr-only md:not-sr-only md:ml-2">Home</span>
                </Button>
              </Link>
              
              <Button 
                variant="outline"
                size="sm"
                className="bg-background/90 hover:bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToTop();
                }}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only md:not-sr-only md:ml-2">Top</span>
              </Button>
              
              <Button 
                variant="outline"
                size="sm"
                className="bg-background/90 hover:bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToBottom();
                }}
              >
                <ArrowDown className="h-4 w-4" />
                <span className="sr-only md:not-sr-only md:ml-2">Bottom</span>
              </Button>
              
              <Button 
                variant="outline"
                size="sm"
                className="bg-background/90 hover:bg-background" 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOverlay();
                }}
              >
                <span>Close</span>
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <div className="comic-pages flex flex-col items-center">
        {images.map((image, index) => (
          <div 
            key={index} 
            className="comic-page w-full" 
            style={{ marginBottom: 0 }} // Ensure no vertical gap between images
          >
            <img 
              src={image.url} 
              alt={`Page ${index + 1}`} 
              className="w-full h-auto object-contain" 
              loading="lazy"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 my-6">
        <Button 
          variant="outline" 
          size="lg" 
          className="bg-background/90 hover:bg-background"
          onClick={() => prevFileId && navigateToFile(prevFileId)}
          disabled={!prevFileId}
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          <span>Previous</span>
        </Button>
        
        <Button 
          variant="outline" 
          size="lg" 
          className="bg-background/90 hover:bg-background"
          onClick={() => nextFileId && navigateToFile(nextFileId)}
          disabled={!nextFileId}
        >
          <span>Next</span>
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    </div>
  );
} 