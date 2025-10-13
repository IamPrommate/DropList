# Google Drive Streaming Setup

## Overview
The app now supports streaming audio directly from Google Drive URLs without downloading files. This uses HTML5 audio's native streaming capabilities.

## Environment Variables

### Required for API-based streaming (recommended)
```bash
NEXT_PUBLIC_GOOGLE_API_KEY=your_google_api_key_here
```

**How to get a Google API key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Google Drive API
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy the API key and add it to your `.env.local` file

## File Sharing Requirements

### Option 1: Public Files (No API key needed)
- Set Google Drive files to "Anyone with the link can view"
- Use the "Add from Drive" button and paste share links
- Works with direct download URLs: `https://drive.google.com/uc?export=download&id=FILE_ID`

### Option 2: API-based streaming (Better performance)
- Requires `NEXT_PUBLIC_GOOGLE_API_KEY` environment variable
- Files can be private (user must be authenticated)
- Uses Google Drive API v3 media endpoint for better streaming
- URL format: `https://www.googleapis.com/drive/v3/files/FILE_ID?alt=media&key=API_KEY`

## Supported URL Formats

The picker accepts these formats:
- `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`
- `https://drive.google.com/open?id=FILE_ID`
- `https://drive.google.com/uc?id=FILE_ID&export=download`
- Raw file IDs: `1ABC123DEF456...`

## Usage

1. **Local files**: Click "Add" to select a folder of audio files
2. **Google Drive**: Click "Add from Drive" and paste one or more Drive links
3. **Mixed playlists**: You can combine local files and Drive URLs in the same playlist

## Benefits

✅ **No downloads**: Stream directly from Drive  
✅ **Instant playback**: No waiting for file downloads  
✅ **Works with existing player**: Same controls and features  
✅ **Mixed sources**: Local files + Drive URLs in one playlist  
✅ **Better performance**: API-based streaming is more reliable  

## Troubleshooting

- **403 Forbidden**: File not shared publicly or API key lacks permissions
- **CORS errors**: Use API key method instead of direct download URLs
- **Slow loading**: Enable API key for better streaming performance


