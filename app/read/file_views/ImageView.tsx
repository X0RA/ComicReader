import React from "react";
import { FileType } from "@/lib/indexdb";

interface ImageViewProps {
  file: FileType;
}

export default function ImageView({ file }: ImageViewProps) {
  return (
    <div className="p-4">
      <div className="flex justify-center">
        <img
          src={URL.createObjectURL(new Blob([file.content as ArrayBuffer], { type: file.type }))}
          alt={file.name}
          className="max-w-full max-h-[70vh] object-contain"
        />
      </div>
    </div>
  );
} 