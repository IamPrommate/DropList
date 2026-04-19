import { AudioExtension, ImageExtension, VideoExtension, FileType } from '@/app/lib/common';
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

// Configurable folder names from environment variables
const CONFIG = {
  ARTIST_FOLDER: process.env.NEXT_PUBLIC_ARTIST_FOLDER || 'artist', // Default: 'artist'
  VIDEO_FOLDER: process.env.NEXT_PUBLIC_VIDEO_FOLDER || 'video', // Default: 'video'
};

// Initialize Google Drive API client
function getDriveClient() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }
  
  return google.drive({
    version: 'v3',
    auth: apiKey,
  });
}

// Fetch all files from a folder using Drive API with pagination
async function fetchFilesFromFolderAPI(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const drive = getDriveClient();
  if (!drive) {
    throw new Error('Google Drive API key not configured');
  }

  const allFiles: Array<{ id: string; name: string; mimeType: string }> = [];
  let pageToken: string | null | undefined = null;

  do {
    console.log(`🔍 DEBUG: Fetching files from folder ${folderId}, pageToken: ${pageToken || 'null'}`);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 1000, // Maximum allowed
      pageToken: pageToken || undefined,
      orderBy: 'name',
    });

    if (response.data.files) {
      allFiles.push(...response.data.files.map((file: { id?: string | null; name?: string | null; mimeType?: string | null }) => ({
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType || '',
      })));
      console.log(`📄 DEBUG: Got ${response.data.files.length} files (total so far: ${allFiles.length})`);
    }

    pageToken = response.data.nextPageToken || null;
  } while (pageToken);

  console.log(`✅ DEBUG: Total files fetched: ${allFiles.length}`);
  return allFiles;
}

// Helper function to fetch files from a subfolder (using API if available, fallback to HTML)
async function fetchTracksFromSubfolder(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string }> | null> {
  try {
    // Try API first if available
    const drive = getDriveClient();
    if (drive) {
      console.log(`🔍 DEBUG: Using Drive API for subfolder ${folderId}`);
      return await fetchFilesFromFolderAPI(folderId);
    }

    // Fallback to HTML scraping
    console.log(`🔍 DEBUG: Using HTML scraping for subfolder ${folderId} (no API key)`);
    const subfolderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    const response = await fetch(subfolderUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch tracks subfolder: ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    const tableRows = html.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
    
    // Convert HTML rows to file objects (basic conversion)
    if (tableRows) {
      return tableRows.map(row => {
        const idMatch = row.match(/data-id="([^"]+)"/);
        const nameMatch = row.match(/data-title="([^"]+)"/) || row.match(/<strong[^>]*>([^<]+)<\/strong>/);
        return {
          id: idMatch ? idMatch[1] : '',
          name: nameMatch ? nameMatch[1] : '',
          mimeType: '',
        };
      }).filter(f => f.id);
    }
    
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Error fetching tracks subfolder:', errorMessage);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      folderId?: string;
      summaryOnly?: boolean;
      /** Omit = legacy (use env). Present string (incl. "") = per-request override; "" = audio at shared folder root. */
      tracksSubfolder?: string | null;
    };
    const { folderId, summaryOnly } = body;

    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    const effectiveTracksFolder: string = Object.prototype.hasOwnProperty.call(body, 'tracksSubfolder')
      ? (body.tracksSubfolder ?? '').trim()
      : (process.env.NEXT_PUBLIC_TRACKS_FOLDER || 'track').trim();

    const drive = getDriveClient();
    let folderName = 'Google Drive Folder';
    let rootFiles: Array<{ id: string; name: string; mimeType: string }> = [];
    let useAPI = false;

    // Try using Drive API first if available
    if (drive) {
      try {
        console.log('🔍 DEBUG: Using Drive API for root folder');
        useAPI = true;
        
        // Get folder name
        const folderResponse = await drive.files.get({
          fileId: folderId,
          fields: 'name',
        });
        if (folderResponse.data.name) {
          folderName = folderResponse.data.name;
        }

        // Get all files with pagination
        rootFiles = await fetchFilesFromFolderAPI(folderId);
        console.log(`✅ DEBUG: API fetched ${rootFiles.length} files from root folder`);
      } catch (apiError) {
        console.warn('⚠️ DEBUG: Drive API failed, falling back to HTML scraping:', apiError);
        useAPI = false;
      }
    }

    // Fallback to HTML scraping if API not available or failed
    if (!useAPI) {
      console.log('🔍 DEBUG: Using HTML scraping for root folder');
      const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
      
      const response = await fetch(folderUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch folder: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Extract folder name from the HTML
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        folderName = titleMatch[1]
          .replace(/\s*-\s*Google\s+Drive\s*$/i, '')
          .replace(/\s*-\s*Google\s+ไดรฟ์\s*$/i, '')
          .replace(/\s*-\s*Google\s*$/i, '')
          .trim();
      }
      
      // Parse the HTML table structure for file information
      const tableRows = html.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
      
      if (tableRows) {
        rootFiles = tableRows.map(row => {
          const idMatch = row.match(/data-id="([^"]+)"/);
          const nameMatch = row.match(/data-title="([^"]+)"/) || row.match(/<strong[^>]*>([^<]+)<\/strong>/);
          return {
            id: idMatch ? idMatch[1] : '',
            name: nameMatch ? nameMatch[1] : '',
            mimeType: '',
          };
        }).filter(f => f.id);
      }
    }
    
    // Parse the files
    const files = [];
    const seenIds = new Set();
    
    // Look for "artist", "cover" and "video" subfolders
    let artistSubfolderId: string | null = null;
    let tracksFolderId: string | null = null;
    let videoSubfolderId: string | null = null;
    
    // Find subfolders from root files
    if (useAPI && drive) {
      // Using API - check mimeType to identify folders
      for (const file of rootFiles) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const fileName = file.name.toLowerCase().trim();
          if (fileName === CONFIG.ARTIST_FOLDER.toLowerCase().trim()) {
            artistSubfolderId = file.id;
            console.log(`Found "${CONFIG.ARTIST_FOLDER}" subfolder via API:`, file.id);
          }
          if (fileName === CONFIG.VIDEO_FOLDER.toLowerCase().trim()) {
            videoSubfolderId = file.id;
            console.log(`Found "${CONFIG.VIDEO_FOLDER}" subfolder via API:`, file.id);
          }
          if (
            effectiveTracksFolder !== '' &&
            fileName === effectiveTracksFolder.toLowerCase()
          ) {
            tracksFolderId = file.id;
            console.log(`Found "${effectiveTracksFolder}" subfolder via API:`, file.id);
          }
        }
      }
    } else {
      // Using HTML scraping - parse from HTML
      // We need to fetch HTML again for subfolder detection if not already done
      const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
      const htmlResponse = await fetch(folderUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        const folderTableRows = html.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
        
        if (folderTableRows) {
          for (const row of folderTableRows) {
            const idMatch = row.match(/data-id="([^"]+)"/);
            if (!idMatch) continue;
            
            const fileId = idMatch[1];
            const isFolder = row.includes('folder') || row.includes('📁') || row.includes('folder-icon');
            
            if (isFolder) {
              const namePatterns = [
                /<strong[^>]*>([^<]+)<\/strong>/i,
                /data-title="([^"]+)"/i,
                /aria-label="[^"]*([^"]+)[^"]*"/i,
                /title="([^"]+)"/i
              ];
              
              let subfolderName = null;
              for (const pattern of namePatterns) {
                const match = row.match(pattern);
                if (match) {
                  subfolderName = match[1];
                  break;
                }
              }
              
              if (subfolderName) {
                const normalizedName = subfolderName.toLowerCase().trim();
                if (normalizedName === CONFIG.ARTIST_FOLDER.toLowerCase().trim()) {
                  artistSubfolderId = fileId;
                }
                if (normalizedName === CONFIG.VIDEO_FOLDER.toLowerCase().trim()) {
                  videoSubfolderId = fileId;
                }
                if (
                  effectiveTracksFolder !== '' &&
                  normalizedName === effectiveTracksFolder.toLowerCase()
                ) {
                  tracksFolderId = fileId;
                }
              }
            }
          }
        }
      }
    }
    
    // Determine if we should look for tracks in a subfolder or root
    if (effectiveTracksFolder !== '') {
      // Strict check: if tracks folder is specified but not found, fail
      if (!tracksFolderId) {
        console.warn(`Tracks folder "${effectiveTracksFolder}" not found`);
        const err = `Tracks folder "${effectiveTracksFolder}" not found. Create that folder under the shared link, or leave "Tracks folder" blank to use the folder root.`;
        if (summaryOnly) {
          return NextResponse.json({
            error: err,
            folderName,
            audioTrackCount: 0,
            albumCoverUrl: null,
          });
        }
        return NextResponse.json({
          error: err,
          files: [],
          folderName,
        });
      }
    }

    // Process files from tracks folder or root
    let filesToProcess: Array<{ id: string; name: string; mimeType: string }> | null = null;
    if (tracksFolderId) {
      filesToProcess = await fetchTracksFromSubfolder(tracksFolderId);
      if (!filesToProcess) {
        console.warn(`Failed to fetch tracks from "${effectiveTracksFolder}" subfolder`);
        const err = `Failed to access "${effectiveTracksFolder}" subfolder. Make sure the folder exists and is shared publicly.`;
        if (summaryOnly) {
          return NextResponse.json({
            error: err,
            folderName,
            audioTrackCount: 0,
            albumCoverUrl: null,
          });
        }
        return NextResponse.json({
          error: err,
          files: [],
          folderName,
        });
      }
    } else {
      console.log('Looking for tracks in root folder...');
      filesToProcess = rootFiles;
    }
    
    if (filesToProcess) {
      console.log(
        'Processing files from:',
        tracksFolderId ? `"${effectiveTracksFolder}" subfolder` : 'root folder'
      );
      
      for (const file of filesToProcess) {
        const fileId = file.id;
        const fileName = file.name;
        
        // Skip if already seen
        if (seenIds.has(fileId)) continue;
        
        // Check if it's an audio or image file using enums
        const isAudioFile = fileName && Object.values(AudioExtension).some(ext => fileName.toLowerCase().endsWith(ext));
        const isImageFile = fileName && Object.values(ImageExtension).some(ext => fileName.toLowerCase().endsWith(ext));
        
        // Also check mimeType if available (from API)
        const isAudioMimeType = file.mimeType && file.mimeType.startsWith('audio/');
        const isImageMimeType = file.mimeType && file.mimeType.startsWith('image/');
        
        if (fileName && (isAudioFile || isAudioMimeType || isImageFile || isImageMimeType) && !seenIds.has(fileId)) {
          seenIds.add(fileId);
          files.push({ 
            id: fileId, 
            name: fileName,
            type: (isAudioFile || isAudioMimeType) ? FileType.AUDIO : FileType.IMAGE
          });
        }
      }
    }

    // Metadata-only: audio files come from the tracks folder / root listing only (not artist/video).
    if (summaryOnly) {
      const audioTrackCount = files.filter((f) => f.type === FileType.AUDIO).length;
      return NextResponse.json({ folderName, audioTrackCount, albumCoverUrl: null });
    }

    console.log('Found files:', files.length, files);

    // Fetch images from artist subfolder only (performance optimized)
    if (artistSubfolderId) {
      try {
        let artistFiles: Array<{ id: string; name: string; mimeType: string }> | null = null;
        
        if (useAPI && drive) {
          // Use API
          artistFiles = await fetchFilesFromFolderAPI(artistSubfolderId);
        } else {
          // Fallback to HTML scraping
          const subfolderUrl = `https://drive.google.com/drive/folders/${artistSubfolderId}`;
          const response = await fetch(subfolderUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          
          if (response.ok) {
            const subfolderHtml = await response.text();
            const subfolderTableRows = subfolderHtml.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
            
            if (subfolderTableRows) {
              artistFiles = subfolderTableRows.map(row => {
                const idMatch = row.match(/data-id="([^"]+)"/);
                const nameMatch = row.match(/data-title="([^"]+)"/) || row.match(/<strong[^>]*>([^<]+)<\/strong>/);
                return {
                  id: idMatch ? idMatch[1] : '',
                  name: nameMatch ? nameMatch[1] : '',
                  mimeType: '',
                };
              }).filter(f => f.id);
            }
          }
        }
        
        if (artistFiles) {
          const subfolderFiles = [];
          for (const file of artistFiles) {
            const fileName = file.name;
            const isImageFile = fileName && Object.values(ImageExtension).some(ext => fileName.toLowerCase().endsWith(ext));
            const isImageMimeType = file.mimeType && file.mimeType.startsWith('image/');
            
            if ((isImageFile || isImageMimeType) && !seenIds.has(file.id)) {
              seenIds.add(file.id);
              subfolderFiles.push({ 
                id: file.id, 
                name: fileName,
                type: FileType.IMAGE,
                source: 'artist-subfolder'
              });
            }
          }
          files.push(...subfolderFiles);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`Error fetching "${CONFIG.ARTIST_FOLDER}" subfolder:`, errorMessage);
      }
    } else {
      console.log(`No "${CONFIG.ARTIST_FOLDER}" subfolder found - skipping image fetch`);
    }
    
    // Fetch videos from video subfolder only (for Stage View)
    if (videoSubfolderId) {
      try {
        let videoFiles: Array<{ id: string; name: string; mimeType: string }> | null = null;
        
        if (useAPI && drive) {
          videoFiles = await fetchFilesFromFolderAPI(videoSubfolderId);
        } else {
          const subfolderUrl = `https://drive.google.com/drive/folders/${videoSubfolderId}`;
          const response = await fetch(subfolderUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          
          if (response.ok) {
            const subfolderHtml = await response.text();
            const subfolderTableRows = subfolderHtml.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
            
            if (subfolderTableRows) {
              videoFiles = subfolderTableRows.map(row => {
                const idMatch = row.match(/data-id="([^"]+)"/);
                const nameMatch = row.match(/data-title="([^"]+)"/) || row.match(/<strong[^>]*>([^<]+)<\/strong>/);
                return {
                  id: idMatch ? idMatch[1] : '',
                  name: nameMatch ? nameMatch[1] : '',
                  mimeType: '',
                };
              }).filter(f => f.id);
            }
          }
        }
        
        if (videoFiles) {
          const subfolderFiles = [];
          for (const file of videoFiles) {
            const fileName = file.name;
            const isVideoFile = fileName && Object.values(VideoExtension).some(ext => fileName.toLowerCase().endsWith(ext));
            const isVideoMimeType = file.mimeType && file.mimeType.startsWith('video/');
            
            if ((isVideoFile || isVideoMimeType) && !seenIds.has(file.id)) {
              seenIds.add(file.id);
              subfolderFiles.push({
                id: file.id,
                name: fileName,
                type: FileType.VIDEO,
                source: 'video-subfolder'
              });
            }
          }
          files.push(...subfolderFiles);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`Error fetching "${CONFIG.VIDEO_FOLDER}" subfolder:`, errorMessage);
      }
    } else {
      console.log(`No "${CONFIG.VIDEO_FOLDER}" subfolder found - skipping video fetch`);
    }
    
    const albumCoverUrl = null;

    console.log(`Total files found: ${files.length} (${files.filter(f => f.type === FileType.AUDIO).length} audio, ${files.filter(f => f.type === FileType.IMAGE).length} images)`);
    
    if (files.length === 0) {
      return NextResponse.json({ 
        error: 'No files found in folder or folder not publicly accessible',
        files: [],
        folderName,
        albumCoverUrl
      });
    }
    
    return NextResponse.json({ files, folderName, albumCoverUrl });
    
  } catch (error) {
    console.error('Error fetching folder:', error);
    let errorMessage = 'Failed to access folder.';
    if (error instanceof Error) {
      errorMessage = `Failed to access folder: ${error.message}`;
    } else if (typeof error === 'string') {
      errorMessage = `Failed to access folder: ${error}`;
    }
    return NextResponse.json({ 
      error: errorMessage,
      files: [],
      folderName: 'Google Drive Folder',
      albumCoverUrl: null
    }, { status: 500 });
  }
}
