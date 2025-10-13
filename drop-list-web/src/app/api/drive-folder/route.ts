import { NextRequest, NextResponse } from 'next/server';

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
    
    // Parse the HTML table structure for file information
    const files = [];
    const seenIds = new Set();
    
    // Look for the HTML table rows that contain file information
    // From the terminal output, I can see the structure has data-id attributes
    const tableRows = html.match(/<tr[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g);
    
    if (tableRows) {
      console.log('Found table rows:', tableRows.length);
      
      for (const row of tableRows) {
        // Extract file ID from data-id attribute
        const idMatch = row.match(/data-id="([^"]+)"/);
        if (!idMatch) continue;
        
        const fileId = idMatch[1];
        
        // Look for the filename in the row - it's usually in a strong tag or title attribute
        const namePatterns = [
          /<strong[^>]*>([^<]+\.MP3)<\/strong>/i,
          /data-title="([^"]+\.MP3)"/i,
          /aria-label="[^"]*([^"]+\.MP3)[^"]*"/i,
          /title="([^"]+\.MP3)"/i
        ];
        
        let fileName = null;
        for (const pattern of namePatterns) {
          const match = row.match(pattern);
          if (match) {
            fileName = match[1];
            break;
          }
        }
        
        if (fileName && fileName.includes('.MP3') && !seenIds.has(fileId)) {
          seenIds.add(fileId);
          files.push({ 
            id: fileId, 
            name: fileName 
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
    
    if (files.length === 0) {
      return NextResponse.json({ 
        error: 'No files found in folder or folder not publicly accessible',
        files: []
      });
    }
    
    return NextResponse.json({ files });
    
  } catch (error) {
    console.error('Error fetching folder:', error);
    return NextResponse.json({ 
      error: `Failed to access folder: ${error.message}`,
      files: []
    }, { status: 500 });
  }
}
