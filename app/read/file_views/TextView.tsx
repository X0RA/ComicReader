import React from "react";
import { FileType } from "@/lib/indexdb";

interface TextViewProps {
  file: FileType;
  fileContent: string;
}

export default function TextView({ file, fileContent }: TextViewProps) {
  return (
    <div className="p-4">
      <pre className="p-4 bg-muted/30 rounded-lg overflow-auto max-h-[60vh]">
        <code>{fileContent}</code>
      </pre>
    </div>
  );
} 