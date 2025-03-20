// Types for our data structure
export interface FileLink {
  name: string;
  url: string;
}

export interface FolderBatch {
  range: string; // e.g. "0-39"
  files: FileLink[];
}

export interface FolderStructure {
  [folderName: string]: FolderBatch[];
}

/**
 * Extracts folder links from an nginx directory listing HTML
 */
function extractFolderLinks(html: string, baseUrl: string): FileLink[] {
  // This regex matches folder links in nginx directory listings
  const folderRegex = /<a href="([^"]+)\/">[^<]+<\/a>/g;
  const folders: FileLink[] = [];
  
  let match;
  while ((match = folderRegex.exec(html)) !== null) {
    const folderPath = match[1];
    folders.push({
      name: decodeURIComponent(folderPath),
      url: `${baseUrl}/${folderPath}/`
    });
  }
  
  return folders;
}

/**
 * Extracts file links from an nginx directory listing HTML
 */
function extractFileLinks(html: string, baseUrl: string): FileLink[] {
  // This regex matches file links in nginx directory listings
  // Specifically looking for common comic file extensions
  const fileRegex = /<a href="([^"]+\.(?:jpg|jpeg|png|gif|webp|cbz|cbr|zip))">[^<]+<\/a>/gi;
  const files: FileLink[] = [];
  
  let match;
  while ((match = fileRegex.exec(html)) !== null) {
    const filePath = match[1];
    files.push({
      name: decodeURIComponent(filePath),
      url: `${baseUrl}/${filePath}`
    });
  }
  
  return files;
}

/**
 * Creates batches of files with approximately batchSize files per batch
 * If the last batch would have only 1-2 files, they are added to the previous batch
 */
function batchFiles(files: FileLink[], batchSize: number): FolderBatch[] {
  const batches: FolderBatch[] = [];
  
  for (let i = 0; i < files.length; i += batchSize) {
    // Check if this is going to be the last batch with just 1-2 files
    const remainingFiles = files.length - i;
    
    if (remainingFiles <= 2 && batches.length > 0) {
      // Add these remaining files to the previous batch
      const prevBatch = batches[batches.length - 1];
      const startIndex = parseInt(prevBatch.range.split('-')[0]);
      const endIndex = files.length - 1;
      
      prevBatch.range = `${startIndex}-${endIndex}`;
      prevBatch.files = files.slice(startIndex, files.length);
    } else {
      // Create a normal batch
      const batchFiles = files.slice(i, i + batchSize);
      const startIndex = i;
      const endIndex = Math.min(i + batchSize - 1, files.length - 1);
      
      batches.push({
        range: `${startIndex}-${endIndex}`,
        files: batchFiles
      });
    }
  }
  
  return batches;
}

/**
 * Lists all comic folders and their files from the comic server,
 * organizing files into batches of approximately 40 per batch.
 */
export async function listFiles(): Promise<FolderStructure> {
  const baseUrl = 'https://comic.xora.space';
  
  // Fetch the main directory
  const response = await fetch(baseUrl);
  const html = await response.text();
  
  // Get all folders
  const folders = extractFolderLinks(html, baseUrl);
  const result: FolderStructure = {};
  
  // Process each folder
  for (const folder of folders) {
    try {
      // Fetch the folder contents
      const folderResponse = await fetch(folder.url);
      const folderHtml = await folderResponse.text();
      
      // Extract file links
      let files = extractFileLinks(folderHtml, folder.url);
      
      // Sort files by name (alphanumeric ascending)
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { 
        numeric: true, 
        sensitivity: 'base' 
      }));
      
      // Create batches of ~40 files
      const batches = batchFiles(files, 40);
      
      // Add to result if there are any files
      if (batches.length > 0) {
        result[folder.name] = batches;
      }
    } catch (error) {
      console.error(`Error processing folder ${folder.name}:`, error);
    }
  }
  
  return result;
}
