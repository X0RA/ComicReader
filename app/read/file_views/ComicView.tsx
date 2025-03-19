import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { FileType } from "@/lib/indexdb";
import JSZip from "jszip";

interface ComicViewProps {
  file: FileType;
}

export default function ComicView({ file }: ComicViewProps) {
  const [archiveImages, setArchiveImages] = useState<{name: string, url: string}[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const extractImages = async () => {
      try {
        const content = file.content as ArrayBuffer;
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(content);
        const imageFiles: {name: string, url: string}[] = [];
        
        // Process all files in the zip
        const processFiles = Object.keys(loadedZip.files).map(async (filename) => {
          const file = loadedZip.files[filename];
          
          // Skip directories and non-image files
          if (file.dir) return;
          
          const fileExt = filename.split('.').pop()?.toLowerCase();
          const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
          
          if (imageExtensions.includes(fileExt || '')) {
            const blob = await file.async('blob');
            const url = URL.createObjectURL(blob);
            imageFiles.push({
              name: filename,
              url: url
            });
          }
        });
        
        await Promise.all(processFiles);
        
        // Sort images by filename (usually gives correct page order)
        imageFiles.sort((a, b) => a.name.localeCompare(b.name));
        
        setArchiveImages(imageFiles);
        setIsLoading(false);
      } catch (e) {
        console.error('Error processing zip file:', e);
        setError("Failed to extract files from archive");
        setIsLoading(false);
      }
    };

    extractImages();

    // Clean up object URLs on component unmount
    return () => {
      archiveImages.forEach(image => {
        URL.revokeObjectURL(image.url);
      });
    };
  }, [file]);

  // Navigation for comic viewer
  const goToNextImage = () => {
    if (currentImageIndex < archiveImages.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  const goToPreviousImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Extracting images...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (archiveImages.length === 0) {
    return (
      <div className="p-4 text-center">
        <p>No images found in this archive.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="p-4 text-center">
        <p>
          Page {currentImageIndex + 1} of {archiveImages.length}
        </p>
      </div>
      
      <div className="relative">
        <div className="flex justify-center p-4">
          <img 
            src={archiveImages[currentImageIndex].url} 
            alt={`Page ${currentImageIndex + 1}`}
            className="max-w-full max-h-[70vh] object-contain"
          />
        </div>
        
        <div className="absolute inset-y-0 left-0 flex items-center">
          <Button 
            variant="ghost" 
            onClick={goToPreviousImage} 
            disabled={currentImageIndex === 0}
            className="h-full px-2 rounded-none opacity-50 hover:opacity-100"
          >
            <ArrowLeft className="h-8 w-8" />
          </Button>
        </div>
        
        <div className="absolute inset-y-0 right-0 flex items-center">
          <Button 
            variant="ghost" 
            onClick={goToNextImage} 
            disabled={currentImageIndex === archiveImages.length - 1}
            className="h-full px-2 rounded-none opacity-50 hover:opacity-100"
          >
            <ArrowLeft className="h-8 w-8 transform rotate-180" />
          </Button>
        </div>
      </div>
      
      <div className="p-4 border-t">
        <div className="flex gap-2 overflow-auto pb-2">
          {archiveImages.map((image, index) => (
            <button 
              key={index} 
              onClick={() => setCurrentImageIndex(index)}
              className={`flex-shrink-0 w-16 h-16 border-2 ${
                index === currentImageIndex ? 'border-primary' : 'border-transparent'
              }`}
            >
              <img 
                src={image.url} 
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 