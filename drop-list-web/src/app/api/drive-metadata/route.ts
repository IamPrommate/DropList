import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { fileId } = await request.json();

  if (!fileId) {
    return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
  }

  try {
    // Get file metadata by making a HEAD request
    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    console.log('Getting metadata for:', url);
    
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to get file metadata' }, { status: 404 });
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const contentLength = response.headers.get('content-length');
    const acceptRanges = response.headers.get('accept-ranges');
    
    console.log('Metadata - Content-Type:', contentType, 'Content-Length:', contentLength, 'Accept-Ranges:', acceptRanges);

    return NextResponse.json({
      success: true,
      contentType,
      contentLength: contentLength ? parseInt(contentLength) : null,
      acceptRanges: acceptRanges === 'bytes',
      url: `/api/drive-file?id=${fileId}`
    });

  } catch (error: any) {
    console.error('Error getting file metadata:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
