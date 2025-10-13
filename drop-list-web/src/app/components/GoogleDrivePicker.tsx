'use client';

import { useMemo, useState } from 'react';
import { Modal, Button, Input, Typography, Space, Alert, Switch } from 'antd';
import type { TrackType } from '../lib/types';

type Props = {
  onPicked: (tracks: TrackType[]) => void;
};

function extractDriveFolderId(input: string): string | null {
  // Supports: https://drive.google.com/drive/folders/FOLDER_ID?usp=share_link
  try {
    const url = new URL(input.trim());
    const pathParts = url.pathname.split('/').filter(Boolean);
    const foldersIndex = pathParts.indexOf('folders');
    if (foldersIndex !== -1 && pathParts[foldersIndex + 1]) {
      return pathParts[foldersIndex + 1];
    }
    return null;
  } catch {
    return null;
  }
}

function extractDriveFileId(input: string): string | null {
  // Supports: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  //           https://drive.google.com/open?id=FILE_ID
  //           https://drive.google.com/uc?id=FILE_ID&export=download
  try {
    const url = new URL(input.trim());
    const pathParts = url.pathname.split('/').filter(Boolean);
    const dIndex = pathParts.indexOf('d');
    if (dIndex !== -1 && pathParts[dIndex + 1]) return pathParts[dIndex + 1];
    const idParam = url.searchParams.get('id');
    if (idParam) return idParam;
    return null;
  } catch {
    // Not a valid URL, might be a raw ID
    if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim();
    return null;
  }
}

async function buildStreamUrl(fileId: string, apiKey?: string | null): Promise<string> {
  // Prefer Drive v3 media endpoint if API key provided and file is publicly accessible
  if (apiKey) {
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  }
  
  // Use server-side proxy to stream the file content directly
  return `/api/drive-file?id=${fileId}`;
}

// Use server-side API to fetch folder contents (no CORS issues)
async function fetchFolderFiles(folderId: string): Promise<{id: string, name: string}[]> {
  try {
    console.log('Fetching folder via server API:', folderId);
    
    const response = await fetch('/api/drive-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ folderId })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    console.log('Successfully found files:', data.files);
    return data.files;
    
  } catch (error) {
    console.error('Error fetching folder:', error);
    throw new Error(`Failed to access folder: ${error.message}. Make sure the folder is shared publicly.`);
  }
}

export default function GoogleDrivePicker({ onPicked }: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [useApiKey, setUseApiKey] = useState(true);
  const apiKey = useMemo(() => process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? null, []);

  const handleConfirm = async () => {
    const lines = raw
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const tracks: TrackType[] = [];
    
    for (const line of lines) {
      try {
        // Try folder first
        const folderId = extractDriveFolderId(line);
        if (folderId) {
          console.log('Processing folder:', folderId);
          const folderFiles = await fetchFolderFiles(folderId);
          console.log('Found files in folder:', folderFiles);
          
          for (let i = 0; i < folderFiles.length; i++) {
            const file = folderFiles[i];
            const url = await buildStreamUrl(file.id, useApiKey ? apiKey : null);
            
            // Pre-load metadata for better duration display
            try {
              const metadataResponse = await fetch('/api/drive-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: file.id })
              });
              
              if (metadataResponse.ok) {
                const metadata = await metadataResponse.json();
                console.log('Metadata for', file.name, ':', metadata);
              }
            } catch (error) {
              console.log('Could not get metadata for', file.name, error);
            }
            
            tracks.push({ 
              id: `${Date.now()}_${file.id}_${i}`, 
              name: file.name, 
              googleDriveUrl: url 
            });
          }
          continue;
        }
        
        // Try individual file as fallback
        const fileId = extractDriveFileId(line);
        if (fileId) {
          console.log('Processing individual file:', fileId);
          const url = await buildStreamUrl(fileId, useApiKey ? apiKey : null);
          console.log('Generated streaming URL:', url);
          
          // Try to get the actual filename from the URL or use a better default
          let name = `Audio File ${fileId.substring(0, 8)}`;
          
          tracks.push({ id: `${Date.now()}_${fileId}`, name, googleDriveUrl: url });
          continue;
        }
        
        // Neither folder nor file
        console.log('Invalid link:', line);
      } catch (error) {
        console.error('Error processing:', line, error);
        // Don't show alert for individual errors, just log them
      }
    }

    console.log('Final tracks:', tracks);
    if (tracks.length > 0) {
      onPicked(tracks);
      setOpen(false);
      setRaw('');
    } else {
      alert('No valid Drive folder links found. Please use Google Drive folder share links.');
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add from Drive</Button>
      <Modal
        title="Add Google Drive audio links"
        open={open}
        onOk={handleConfirm}
        onCancel={() => setOpen(false)}
        okText="Add"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            message="Paste Google Drive folder share links (one per line). Folder must be shared publicly."
          />
          <Alert
            type="warning"
            message="If folder access fails, you can also paste individual file links from your folder."
            description="Right-click each file in your folder → 'Get link' → paste the individual file links here."
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch checked={useApiKey} onChange={setUseApiKey} />
            <Typography.Text>
              Use API key streaming{apiKey ? '' : ' (optional - no NEXT_PUBLIC_GOOGLE_API_KEY set)'}
            </Typography.Text>
          </div>
          <Input.TextArea
            rows={6}
            placeholder="https://drive.google.com/drive/folders/FOLDER_ID?usp=share_link\nOR individual file links:\nhttps://drive.google.com/file/d/FILE_ID/view?usp=sharing\nhttps://drive.google.com/file/d/FILE_ID2/view?usp=sharing"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </Space>
      </Modal>
    </>
  );
}


