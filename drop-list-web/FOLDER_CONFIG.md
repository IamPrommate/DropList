# Folder Configuration Guide

## Overview
The DropList app now supports configurable folder structures for Google Drive playlists. You can easily change folder names without modifying the code by using environment variables.

## Environment Variables

Create a `.env.local` file in your project root with these variables:

```bash
# Google Drive API Key (optional - for better streaming performance)
NEXT_PUBLIC_GOOGLE_API_KEY=your_google_api_key_here

# Folder Configuration
NEXT_PUBLIC_TRACKS_FOLDER=
NEXT_PUBLIC_ARTIST_FOLDER=artist
```

## Configuration Examples

### Current Structure (Default)
```
Google Drive Folder/
├── Song1 (Artist1).mp3
├── Song2 (Artist2).mp3
└── artist/
    ├── Artist1.jpg
    └── Artist2.png
```

**Environment Variables:**
```bash
NEXT_PUBLIC_TRACKS_FOLDER=
NEXT_PUBLIC_ARTIST_FOLDER=artist
```

### Future Structure (Tracks in Subfolder)
```
Google Drive Folder/
├── tracks/
│   ├── Song1 (Artist1).mp3
│   └── Song2 (Artist2).mp3
└── pianist/
    ├── Artist1.jpg
    └── Artist2.png
```

**Environment Variables:**
```bash
NEXT_PUBLIC_TRACKS_FOLDER=tracks
NEXT_PUBLIC_ARTIST_FOLDER=pianist
```

### Custom Structure
```
Google Drive Folder/
├── music/
│   ├── Song1 (Artist1).mp3
│   └── Song2 (Artist2).mp3
└── photos/
    ├── Artist1.jpg
    └── Artist2.png
```

**Environment Variables:**
```bash
NEXT_PUBLIC_TRACKS_FOLDER=music
NEXT_PUBLIC_ARTIST_FOLDER=photos
```

## How It Works

1. **Tracks folder (two layers)**  
   - **In-app import (Google Drive modal):** You can set an optional “Tracks folder” field per import. Leave it **blank** to list audio from the **shared link folder only** (the folder root). Enter a **subfolder name** (exact match, case-insensitive) if audio lives one level down (e.g. `track`, `tracks`, `mytrack`). That choice is **saved on the playlist** so reopening the app uses the same resolution.  
   - **API / legacy callers:** If the request to `/api/drive-folder` **does not** include `tracksSubfolder`, the app uses `NEXT_PUBLIC_TRACKS_FOLDER` (default `track` in code). That matches older playlists whose `tracks_subfolder` column is `NULL` in the database.

2. **Artist Images Folder**: Set `NEXT_PUBLIC_ARTIST_FOLDER` to the name of the folder containing artist images
   - Images are matched to tracks based on artist names extracted from filenames
   - Supports JPG, JPEG, PNG, GIF, WEBP, BMP, SVG formats

## Benefits

- ✅ **No code changes needed** for server defaults — update environment variables for API/legacy behavior; the Drive import UI can override per playlist
- ✅ **Flexible structure** - Support any folder naming convention
- ✅ **Easy migration** - Change structure without breaking existing playlists
- ✅ **Backward compatible** - Default values work with current structure

## Usage

1. Create your Google Drive folder structure
2. Update `.env.local` with your folder names
3. Restart your development server (`npm run dev`)
4. Test with your Google Drive folder link

The system will automatically detect and use your configured folder structure!
