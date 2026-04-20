import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { tracks, folderName } = await request.json();
    
    if (!tracks || !Array.isArray(tracks)) {
      return NextResponse.json({ error: 'Tracks array is required' }, { status: 400 });
    }

    // Create a streaming ZIP download
    const stream = new ReadableStream({
      async start(controller) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        
        // Process tracks sequentially to avoid memory issues
        for (const track of tracks) {
          try {
            if (track.file) {
              // Local file - add directly
              zip.file(track.name, track.file);
            } else if (track.googleDriveUrl) {
              const u = track.googleDriveUrl as string;
              let response: Response;
              if (/^https?:\/\//i.test(u)) {
                response = await fetch(u);
              } else {
                const fileId = extractFileId(u);
                if (!fileId) continue;
                response = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  },
                });
              }

              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                zip.file(track.name, arrayBuffer);
              }
            }
          } catch (error) {
            console.warn(`Failed to add ${track.name}:`, error);
          }
        }

        // Generate ZIP as stream
        const zipBlob = await zip.generateAsync({ 
          type: 'blob',
          streamFiles: true,
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });

        // Convert blob to stream
        const reader = zipBlob.stream().getReader();
        
        function pump(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
            return pump();
          });
        }
        
        return pump();
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${folderName || 'playlist'}.zip"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Error creating ZIP:', error);
    return NextResponse.json({ error: 'Failed to create download' }, { status: 500 });
  }
}

function extractFileId(url: string): string | null {
  try {
    if (url.includes('/api/drive-file')) {
      const urlObj = new URL(url, 'http://localhost');
      return urlObj.searchParams.get('id');
    }
    
    const urlObj = new URL(url);
    const id = urlObj.searchParams.get('id');
    if (id) return id;
    
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const fileIndex = pathParts.indexOf('file');
    if (fileIndex !== -1 && pathParts[fileIndex + 1]) {
      return pathParts[fileIndex + 1];
    }
    
    return null;
  } catch {
    return null;
  }
}

