import { AudioExtension, ImageExtension } from '@/app/lib/common';
import { NextRequest, NextResponse } from 'next/server';

// Configurable folder names from environment variables
const CONFIG = {
  TRACKS_FOLDER: process.env.NEXT_PUBLIC_TRACKS_FOLDER || '', // Default: empty (root folder)
  ARTIST_FOLDER: process.env.NEXT_PUBLIC_ARTIST_FOLDER || 'artist', // Default: 'artist'
};

// Helper function to fetch files from a subfolder
async function fetchTracksFromSubfolder(folderId: string) {
  try {
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
    return html.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Error fetching tracks subfolder:', errorMessage);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { folderId } = await request.json();
    
    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    
    // Fetch the folder page from server-side (no CORS issues)
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
    let folderName = 'Google Drive Folder';
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      // Remove various Google Drive suffixes (English, Thai, etc.)
      folderName = titleMatch[1]
        .replace(/\s*-\s*Google\s+Drive\s*$/i, '')
        .replace(/\s*-\s*Google\s+ไดรฟ์\s*$/i, '')
        .replace(/\s*-\s*Google\s*$/i, '')
        .trim();
    }
    
    // Parse the HTML table structure for file information
    const files = [];
    const seenIds = new Set();
    
    // Look for the HTML table rows that contain file information
    // From the terminal output, I can see the structure has data-id attributes
    const tableRows = html.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
    
    // Look for "artist" subfolder specifically - try multiple approaches
    let artistSubfolderId = null;
    
    
    // Approach 1: Look for folder links in table rows (same as files)
    const folderTableRows = html.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
    if (folderTableRows) {
      for (const row of folderTableRows) {
        const idMatch = row.match(/data-id="([^"]+)"/);
        if (!idMatch) continue;
        
        const folderId = idMatch[1];
        
        // Look for folder indicators in the row
        const isFolder = row.includes('folder') || row.includes('📁') || row.includes('folder-icon');
        
        if (isFolder) {
          // Try to extract folder name from various patterns
          const namePatterns = [
            /<strong[^>]*>([^<]+)<\/strong>/i,
            /data-title="([^"]+)"/i,
            /aria-label="[^"]*([^"]+)[^"]*"/i,
            /title="([^"]+)"/i
          ];
          
          let folderName = null;
          for (const pattern of namePatterns) {
            const match = row.match(pattern);
            if (match) {
              folderName = match[1];
              break;
            }
          }
          
          
          // Check for artist folder (configurable)
          if (folderName && folderName.toLowerCase().includes(CONFIG.ARTIST_FOLDER.toLowerCase())) {
            artistSubfolderId = folderId;
            break;
          }
        }
      }
    }
    
    // Approach 2: Look for direct folder links (fallback)
    if (!artistSubfolderId) {
      const subfolderLinks = html.match(/<a[^>]*href="[^"]*\/folders\/([a-zA-Z0-9_-]{20,})[^"]*"[^>]*>/g)?.filter(link => 
        !link.includes('accounts.google.com') && !link.includes('ServiceLogin')
      );
      
      if (subfolderLinks) {
        console.log('Found subfolder links:', subfolderLinks.length);
        
        for (const link of subfolderLinks) {
          const idMatch = link.match(/\/folders\/([a-zA-Z0-9_-]{20,})/);
          if (idMatch) {
            const subfolderId = idMatch[1];
            
            // Check if this link contains "artist" in the text (folder name)
            const linkTextMatch = link.match(/>([^<]+)</);
            console.log('Checking subfolder link:', link.substring(0, 100) + '...');
            console.log('Link text match:', linkTextMatch ? linkTextMatch[1] : 'No text found');
            
            if (linkTextMatch && linkTextMatch[1].toLowerCase().includes(CONFIG.ARTIST_FOLDER.toLowerCase())) {
              artistSubfolderId = subfolderId;
              console.log(`Found "${CONFIG.ARTIST_FOLDER}" subfolder:`, subfolderId);
              break;
            }
          }
        }
      } else {
        console.log('No subfolder links found in HTML');
      }
    }
    
    // Determine if we should look for tracks in a subfolder or root
    let tracksFolderId = null;
    if (CONFIG.TRACKS_FOLDER && CONFIG.TRACKS_FOLDER.trim() !== '') {
      // Look for tracks subfolder
      for (const row of folderTableRows || []) {
        const idMatch = row.match(/data-id="([^"]+)"/);
        if (!idMatch) continue;
        
        const folderId = idMatch[1];
        const isFolder = row.includes('folder') || row.includes('📁') || row.includes('folder-icon');
        
        if (isFolder) {
          const namePatterns = [
            /<strong[^>]*>([^<]+)<\/strong>/i,
            /data-title="([^"]+)"/i,
            /aria-label="[^"]*([^"]+)[^"]*"/i,
            /title="([^"]+)"/i
          ];
          
          let folderName = null;
          for (const pattern of namePatterns) {
            const match = row.match(pattern);
            if (match) {
              folderName = match[1];
              break;
            }
          }
          
          if (folderName && folderName.toLowerCase().includes(CONFIG.TRACKS_FOLDER.toLowerCase())) {
            tracksFolderId = folderId;
            break;
          }
        }
      }
      
      // Strict check: if tracks folder is specified but not found, fail
      if (!tracksFolderId) {
        console.warn(`Tracks folder "${CONFIG.TRACKS_FOLDER}" not found`);
        return NextResponse.json({ 
          error: `Tracks folder "${CONFIG.TRACKS_FOLDER}" not found. Please create the folder or check your NEXT_PUBLIC_TRACKS_FOLDER configuration.`,
          files: [],
          folderName
        });
      }
    }

    // Process files from tracks folder or root (strict - no fallback)
    let filesToProcess = null;
    if (tracksFolderId) {
      filesToProcess = await fetchTracksFromSubfolder(tracksFolderId);
      if (!filesToProcess) {
        console.warn(`Failed to fetch tracks from "${CONFIG.TRACKS_FOLDER}" subfolder`);
        return NextResponse.json({ 
          error: `Failed to access "${CONFIG.TRACKS_FOLDER}" subfolder. Make sure the folder exists and is shared publicly.`,
          files: [],
          folderName
        });
      }
    } else {
      console.log('Looking for tracks in root folder...');
      filesToProcess = tableRows;
    }
    
    if (filesToProcess) {
      console.log('Processing files from:', tracksFolderId ? `"${CONFIG.TRACKS_FOLDER}" subfolder` : 'root folder');
      
      for (const row of filesToProcess) {
        // Extract file ID from data-id attribute
        const idMatch = row.match(/data-id="([^"]+)"/);
        if (!idMatch) continue;
        
        const fileId = idMatch[1];
        
        // Look for the filename in the row - it's usually in a strong tag or title attribute
        const audioExts = Object.values(AudioExtension).join('|').replace(/\./g, '');
        const imageExts = Object.values(ImageExtension).join('|').replace(/\./g, '');
        const allExts = `${audioExts}|${imageExts}`;
        
        const namePatterns = [
          new RegExp(`<strong[^>]*>([^<]+\\.(${allExts}))<\\/strong>`, 'i'),
          new RegExp(`data-title="([^"]+\\.(${allExts}))"`, 'i'),
          new RegExp(`aria-label="[^"]*([^"]+\\.(${allExts}))[^"]*"`, 'i'),
          new RegExp(`title="([^"]+\\.(${allExts}))"`, 'i')
        ];
        
        let fileName = null;
        for (const pattern of namePatterns) {
          const match = row.match(pattern);
          if (match) {
            fileName = match[1];
            break;
          }
        }
        
        // Check if it's an audio or image file using enums
        const isAudioFile = fileName && Object.values(AudioExtension).some(ext => fileName.toLowerCase().endsWith(ext));
        const isImageFile = fileName && Object.values(ImageExtension).some(ext => fileName.toLowerCase().endsWith(ext));
        
        if (fileName && (isAudioFile || isImageFile) && !seenIds.has(fileId)) {
          seenIds.add(fileId);
          files.push({ 
            id: fileId, 
            name: fileName,
            type: isAudioFile ? 'audio' : 'image'
          });
        }
      }
    }
    
    console.log('Found files from HTML table:', files.length, files);
    
    // Fallback: Look for files in HTML attributes if regex parsing failed
    if (files.length === 0) {
      console.log('Trying HTML attribute parsing as fallback...');
      const filePattern = /data-id="([a-zA-Z0-9_-]{20,})"[^>]*data-title="([^"]+)"/g;
      let match;
      while ((match = filePattern.exec(html)) !== null) {
        const id = match[1];
        const name = match[2];
        
        if (!seenIds.has(id) && name && name.trim()) {
          seenIds.add(id);
          files.push({ id, name: name.trim() });
        }
      }
    }
    
    // Fetch images from artist subfolder only (performance optimized)
    if (artistSubfolderId) {
      
      try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const subfolderUrl = `https://drive.google.com/drive/folders/${artistSubfolderId}`;
        const response = await fetch(subfolderUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.warn(`Failed to fetch "artist" subfolder: ${response.statusText}`);
        } else {
          const subfolderHtml = await response.text();
          const subfolderFiles = [];
          
          // Parse subfolder for image files only
          const subfolderTableRows = subfolderHtml.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
          if (subfolderTableRows) {
            for (const row of subfolderTableRows) {
              const idMatch = row.match(/data-id="([^"]+)"/);
              if (!idMatch) continue;
              
              const fileId = idMatch[1];
              
              // Look for image files only in the artist subfolder using enums
              const imageExts = Object.values(ImageExtension).join('|').replace(/\./g, '');
              const namePatterns = [
                new RegExp(`<strong[^>]*>([^<]+\\.(${imageExts}))<\\/strong>`, 'i'),
                new RegExp(`data-title="([^"]+\\.(${imageExts}))"`, 'i'),
                new RegExp(`aria-label="[^"]*([^"]+\\.(${imageExts}))[^"]*"`, 'i'),
                new RegExp(`title="([^"]+\\.(${imageExts}))"`, 'i')
              ];
              
              let fileName = null;
              for (const pattern of namePatterns) {
                const match = row.match(pattern);
                if (match) {
                  fileName = match[1];
                  break;
                }
              }
              
              if (fileName && Object.values(ImageExtension).some(ext => fileName.toLowerCase().endsWith(ext)) && !seenIds.has(fileId)) {
                seenIds.add(fileId);
                subfolderFiles.push({ 
                  id: fileId, 
                  name: fileName,
                  type: 'image',
                  source: 'artist-subfolder'
                });
              }
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
    
    console.log(`Total files found: ${files.length} (${files.filter(f => f.type === 'audio').length} audio, ${files.filter(f => f.type === 'image').length} images)`);
    
    if (files.length === 0) {
      return NextResponse.json({ 
        error: 'No files found in folder or folder not publicly accessible',
        files: [],
        folderName
      });
    }
    
    return NextResponse.json({ files, folderName });
    
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
      folderName: 'Google Drive Folder'
    }, { status: 500 });
  }
}
