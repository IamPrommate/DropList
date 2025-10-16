import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('id');
  const range = request.headers.get('range');

  if (!fileId) {
    return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
  }

  try {
    // Try to get the file content directly
    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    console.log('Fetching file content from:', url, 'Range:', range);
    
    const headers: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    
    // Forward range requests for seeking support
    if (range) {
      headers['Range'] = range;
    }
    
    const response = await fetch(url, { headers });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 404 });
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    
    console.log('Content-Type:', contentType, 'Content-Length:', contentLength, 'Content-Range:', contentRange);

    // Return the file content as a stream with proper headers for audio streaming
    const responseHeaders: HeadersInit = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };
    
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }
    
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching file:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
