# Google Drive Folder Sync

Sync all files from Google Drive folder `1ZfRENwkvB9Q54iCizBp8kiDC9X6NvJX3` (https://drive.google.com/drive/folders/1ZfRENwkvB9Q54iCizBp8kiDC9X6NvJX3) into Knowledge Plane as facts.

## Steps

1. Get Google OAuth access token from secrets (with Drive API scope `https://www.googleapis.com/auth/drive.readonly`)
2. List all files in the folder recursively (including subfolders)
3. For each file:
   - Download the file content
   - Extract text/content from the file
   - Create facts in Knowledge Plane using `facts.create()` or `facts.bulkCreate()` API

## Code

```javascript
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const FOLDER_ID = '1ZfRENwkvB9Q54iCizBp8kiDC9X6NvJX3';

// Get Google OAuth access token from secrets
// The secrets object is automatically available in the execution context
const accessToken = secrets.googleAccessToken || secrets.GOOGLE_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error('Google OAuth access token required. Add "googleAccessToken" to data source secrets.');
}

// List all files recursively in folder
async function listFilesRecursive(folderId, token) {
  const allFiles = [];
  
  async function listFolder(folderId, depth = 0) {
    const indent = '  '.repeat(depth);
    let pageToken = null;
    let pageCount = 0;
    
    do {
      pageCount++;
      const query = `'${folderId}' in parents and trashed=false`;
      const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to list files: ${res.status} ${res.statusText} - ${errorText}`);
      }
      
      const data = await res.json();
      
      if (!data.files) {
        console.log(`${indent}Warning: No 'files' property in response:`, JSON.stringify(data));
        break;
      }
      
      const files = data.files || [];
      console.log(`${indent}Found ${files.length} items in folder (page ${pageCount})`);
      
      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          console.log(`${indent}Entering subfolder: ${file.name} (${file.id})`);
          await listFolder(file.id, depth + 1); // Recurse into subfolder
        } else {
          console.log(`${indent}Found file: ${file.name} (${file.id})`);
          allFiles.push(file);
        }
      }
      
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  
  console.log(`Listing files recursively from folder: ${folderId}`);
  await listFolder(folderId);
  console.log(`Total files found: ${allFiles.length}`);
  return allFiles;
}

// Download file from Google Drive and extract text content
async function downloadFileContent(fileId, fileName, mimeType, token) {
  // Check for unsupported binary file formats that cannot be converted to text
  const isBinaryOfficeFile = 
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    fileName.toLowerCase().endsWith('.docx') ||
    fileName.toLowerCase().endsWith('.doc') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    fileName.toLowerCase().endsWith('.xlsx') ||
    fileName.toLowerCase().endsWith('.xls') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    fileName.toLowerCase().endsWith('.pptx') ||
    fileName.toLowerCase().endsWith('.ppt');
  
  // Skip binary Office files - they require special parsing libraries
  // Note: Google Workspace files (application/vnd.google-apps.*) are handled separately below
  if (isBinaryOfficeFile && !mimeType.startsWith('application/vnd.google-apps.')) {
    throw new Error(`Binary Office file format not supported: ${fileName} (${mimeType}). Only Google Workspace files (Google Docs, Sheets, Slides) or text-based files can be processed. To process Office files, convert them to Google Workspace format in Drive first.`);
  }
  
  let downloadUrl = `${DRIVE_API_BASE}/files/${fileId}`;
  let finalMimeType = mimeType;
  let useExport = false;
  
  // Convert Google Workspace files to exportable formats
  // Note: Export API only works for Google Workspace files, not uploaded Office files
  if (mimeType === 'application/vnd.google-apps.document') {
    downloadUrl += '/export?mimeType=text/plain';
    finalMimeType = 'text/plain';
    useExport = true;
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    downloadUrl += '/export?mimeType=text/csv';
    finalMimeType = 'text/csv';
    useExport = true;
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    downloadUrl += '/export?mimeType=text/plain';
    finalMimeType = 'text/plain';
    useExport = true;
  } else if (mimeType.startsWith('application/vnd.google-apps.')) {
    downloadUrl += '/export?mimeType=application/pdf';
    finalMimeType = 'application/pdf';
    useExport = true;
  } else {
    downloadUrl += '?alt=media';
  }
  
  const res = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!res.ok) {
    // Handle export API errors (403 Forbidden means file is not exportable)
    if (useExport && (res.status === 400 || res.status === 403)) {
      const errorText = await res.text();
      throw new Error(`File cannot be exported: ${fileName} (${mimeType}). Google Drive export API only supports Google Workspace files. Error: ${res.status} ${res.statusText}`);
    } else {
      const errorText = await res.text();
      throw new Error(`Failed to download file: ${res.status} ${res.statusText} - ${errorText}`);
    }
  }
  
  // Check if the response is text-based or binary
  const contentType = res.headers.get('content-type') || '';
  const isTextBased = contentType.startsWith('text/') || 
                      contentType.includes('json') ||
                      contentType.includes('csv') ||
                      contentType.includes('xml') ||
                      contentType.includes('javascript') ||
                      contentType.includes('html') ||
                      useExport; // Export API responses are text-based
  
  let text;
  if (isTextBased) {
    // For text-based content, decode as UTF-8
    text = await res.text();
  } else {
    // For binary content, download as array buffer and check if it's actually text
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Try to decode as UTF-8, but check if it's valid text
    text = buffer.toString('utf-8');
    
    // Check if the decoded text contains too many non-printable characters
    // (indicating it's likely binary data)
    const nonPrintableCount = (text.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []).length;
    const nonPrintableRatio = nonPrintableCount / text.length;
    
    if (nonPrintableRatio > 0.1 && text.length > 100) {
      // Likely binary data - cannot extract text without proper parsing library
      throw new Error(`Binary file detected: ${fileName} (${mimeType}). Cannot extract text content. Only text-based files or files that can be exported to text format are supported.`);
    }
  }
  
  return { filename: fileName, mimeType: finalMimeType, content: text };
}

// Verify folder exists and is accessible
async function verifyFolder(folderId, token) {
  const url = `${DRIVE_API_BASE}/files/${folderId}?fields=id,name,mimeType&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to access folder: ${res.status} ${res.statusText} - ${errorText}`);
  }
  
  const folder = await res.json();
  if (folder.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error(`The provided ID is not a folder: ${folder.name} (${folder.mimeType})`);
  }
  
  console.log(`Verified folder: ${folder.name} (${folder.id})`);
  return folder;
}

// Main execution
async function syncFolder() {
  await logProgress('Starting Google Drive folder sync', { folderId: FOLDER_ID });
  console.log(`Syncing Google Drive folder: ${FOLDER_ID}`);
  
  // Verify folder exists and is accessible
  await logProgress('Verifying folder access...');
  await verifyFolder(FOLDER_ID, accessToken);
  
  await logProgress('Listing all files recursively from folder...');
  const files = await listFilesRecursive(FOLDER_ID, accessToken);
  await logProgress(`Found ${files.length} files to process`, { totalFiles: files.length });
  console.log(`Found ${files.length} files`);
  
  let factsCreated = 0;
  let errors = 0;
  const factsToCreate = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = i + 1;
    const percentComplete = Math.round((progress / files.length) * 100);
    
    try {
      await logProgress(`Processing file ${progress}/${files.length} (${percentComplete}%): ${file.name}`, {
        fileIndex: progress,
        totalFiles: files.length,
        fileName: file.name,
        fileId: file.id,
        percentComplete: percentComplete,
      });
      console.log(`Processing: ${file.name}`);
      
      const { filename, mimeType, content } = await downloadFileContent(file.id, file.name, file.mimeType, accessToken);
      
      // Create fact from file content
      // Use facts API available in the execution context
      const factContent = `File: ${filename}\n\n${content}`;
      const metadata = {
        source: 'google_drive',
        folder_id: FOLDER_ID,
        file_id: file.id,
        file_name: filename,
        mime_type: mimeType,
        modified_time: file.modifiedTime || new Date().toISOString(),
      };
      
      factsToCreate.push({
        content: factContent,
        metadata: metadata,
      });
      
      factsCreated++;
    } catch (error) {
      await logProgress(`Error processing file: ${file.name}`, {
        fileName: file.name,
        fileId: file.id,
        error: error.message,
      });
      console.error(`Error processing ${file.name}:`, error.message);
      errors++;
    }
  }
  
  // Bulk create all facts at once for better performance
  if (factsToCreate.length > 0) {
    await logProgress(`Creating ${factsToCreate.length} facts in bulk...`, {
      factsCount: factsToCreate.length,
    });
    console.log(`Creating ${factsToCreate.length} facts...`);
    await facts.bulkCreate(factsToCreate);
    await logProgress(`Successfully created ${factsToCreate.length} facts`, {
      factsCreated: factsToCreate.length,
    });
    console.log(`Successfully created ${factsToCreate.length} facts`);
  }
  
  await logProgress(`Sync completed: ${factsCreated} facts created, ${errors} errors`, {
    totalFiles: files.length,
    factsCreated: factsCreated,
    errors: errors,
  });
  console.log(`\nCompleted: ${factsCreated} facts created, ${errors} errors`);
  return { total: files.length, factsCreated, errors };
}

// Execute
await syncFolder();
```

## Important Notes

- **Authentication**: Requires Google OAuth access token with `https://www.googleapis.com/auth/drive.readonly` scope
  - Add the token to data source secrets as `googleAccessToken` or `GOOGLE_ACCESS_TOKEN`
- **Facts API**: The code uses `facts.bulkCreate()` to store facts directly in Knowledge Plane
  - Each file becomes a fact with metadata including source, file_id, file_name, mime_type, etc.
- **Google Workspace Files**: Automatically converted (Docs→text, Sheets→CSV, Slides→text)
- **Binary Office Files**: Uploaded Office files (.docx, .doc, .xlsx, .xls, .pptx, .ppt) are not supported and will be skipped. Only Google Workspace files (Google Docs, Sheets, Slides) or text-based files can be processed. To process Office files, convert them to Google Workspace format in Drive first.
- **Recursive**: Processes all subfolders automatically
- **Error Handling**: Files that cannot be processed (e.g., unsupported binary formats) are logged as errors but don't stop the sync process. The sync continues with remaining files.
- **Execution Context**: 
  - `secrets` object contains the Google access token
  - `facts` API is available for creating facts
  - `console` is available for logging
  - `logProgress(message, metadata?)` is available for custom progress logging that appears in the execution logs UI

## Generating Google Drive Access Token

You need a Google OAuth access token with the `https://www.googleapis.com/auth/drive.readonly` scope. Here are two methods:

### Method 1: Using OAuth 2.0 Playground (Easiest)

1. Go to https://developers.google.com/oauthplayground/
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
5. In the left panel, find and select:
   - `https://www.googleapis.com/auth/drive.readonly`
6. Click "Authorize APIs"
7. Sign in with your Google account and grant permissions
8. Click "Exchange authorization code for tokens"
9. Copy the `access_token` value from the response

### Method 2: Using the Script (Command Line)

Run the provided script:

```bash
node scripts/get-gdrive-token.js
```

Or with explicit credentials:

```bash
node scripts/get-gdrive-token.js <GOOGLE_CLIENT_ID> <GOOGLE_CLIENT_SECRET>
```

The script will:
- Open your browser for authorization
- Start a local server to receive the callback
- Display your access token and refresh token (if available)

**Note:** Access tokens expire after ~1 hour. If you receive a refresh token, save it to generate new access tokens when needed.

## Setup

1. Create a data source with this skill file
2. Add Google OAuth access token to data source secrets:
   - Key: `googleAccessToken`
   - Value: Your Google OAuth access token (from Method 1 or 2 above)
3. The code will automatically sync all files from the specified folder and create facts in Knowledge Plane

