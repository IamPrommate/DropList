import {
  useCallback,
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import { Play, Pause, Download, Cloud, File, Pencil, Image, Trash2 } from 'lucide-react';
import {
  PLAYLIST_NAME_MAX_LENGTH,
  truncatePlaylistNameForDisplay,
} from '../lib/playlistNameLimits';
import { Progress } from 'antd';
import { formatDuration } from '../../utils/time';
import JSZip from 'jszip';
import { extractDominantColor, darkenColor, saturateColor } from '../../utils/color';
import { squareCenterCropToJpegBlob } from '../../utils/squareCenterCrop';
import type { SavedPlaylist } from '../lib/types';

/** Inline vars this screen may set; removing them restores :root purple theme from layout.scss */
const ALBUM_THEME_VARS_TO_CLEAR = [
  '--bg-gradient-start',
  '--bg-gradient-middle',
  '--bg-gradient-end',
  '--switch-bg',
  '--switch-border',
  '--switch-checked-bg',
  '--switch-checked-border',
  '--switch-hover',
  '--switch-checked-hover',
  '--shadow-primary',
  '--shadow-primary-glow',
  '--playlist-active-shadow',
  '--player-border',
  '--primary-gradient-start',
  '--primary-gradient-middle',
  '--primary-gradient-end',
  '--primary-gradient-hover-start',
  '--primary-gradient-hover-middle',
  '--primary-gradient-hover-end',
] as const;

function clearAlbumDrivenThemeOverrides() {
  for (const v of ALBUM_THEME_VARS_TO_CLEAR) {
    document.documentElement.style.removeProperty(v);
  }
}

interface TrackType {
  id: string;
  name: string;
  file?: File;
  url?: string;
  googleDriveUrl?: string;
}

interface PlaylistHeaderProps {
  tracks: TrackType[];
  selectedFolderName: string | null;
  totalDuration: number;
  /** False while per-track lengths are still loading — avoids a climbing partial total in the subtitle. */
  albumDurationReady?: boolean;
  isPlaying: boolean;
  /** When false, audio is from another playlist — header shows Play, not Pause, while `isPlaying` may still be true globally. */
  playbackIsFromThisPlaylist?: boolean;
  currentIndex: number;
  albumCoverUrl?: string | null;
  showCoverImage?: boolean;
  onPlayPause: () => void;
  onPlayFirst: () => void;
  /** When set, shows the Edit control; after editing, called with the new playlist display name (PATCH `/api/playlists` when saved). */
  onAlbumTitleChange?: (name: string) => void | Promise<void>;
  /** Pro-only: full album cover menu (change / remove). Free users see the same pencil in edit mode but tap opens `onAlbumCoverRequiresPro`. */
  canEditAlbumCover?: boolean;
  /** Free (or non-Pro): album cover pencil in edit mode opens upgrade. */
  onAlbumCoverRequiresPro?: () => void;
  /** Saved playlist id required for cover upload; omit or null to hide cover overlay. */
  coverPlaylistId?: string | null;
  /** Authenticated user with a saved active playlist — enables cover overlay while editing title. */
  coverUploadEnabled?: boolean;
  /** Called after POST `/api/playlists/cover` succeeds with the updated row. */
  onCoverUploaded?: (playlist: SavedPlaylist) => void;
  /** Clear custom cover (PATCH `cover_url: null`); optional gradient-only state. */
  onCoverRemoved?: () => void | Promise<void>;
}

export default function PlaylistHeader({
  tracks,
  selectedFolderName,
  totalDuration,
  albumDurationReady = true,
  isPlaying,
  playbackIsFromThisPlaylist = true,
  currentIndex,
  albumCoverUrl,
  showCoverImage = true,
  onPlayPause,
  onPlayFirst,
  onAlbumTitleChange,
  canEditAlbumCover = true,
  onAlbumCoverRequiresPro,
  coverPlaylistId = null,
  coverUploadEnabled = false,
  onCoverUploaded,
  onCoverRemoved,
}: PlaylistHeaderProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadAbortController = useRef<AbortController | null>(null);
  const [isAlbumCoverLoading, setIsAlbumCoverLoading] = useState(!!albumCoverUrl);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleSnapshotRef = useRef('');
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  /** Synced in handlers so blur-after-Escape does not commit. */
  const titleEditingRef = useRef(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const headerShowsPause = isPlaying && playbackIsFromThisPlaylist;

  const hasPlaylistRenameHandler = Boolean(onAlbumTitleChange);
  /** Free + Pro: rename playlist title. */
  const allowTitleRename = hasPlaylistRenameHandler;

  const showProCoverEditUi =
    canEditAlbumCover &&
    titleEditing &&
    coverUploadEnabled &&
    Boolean(coverPlaylistId) &&
    Boolean(onCoverUploaded);

  /** Free: same pencil as Pro while editing title; click opens upgrade. */
  const showFreeCoverEditTeaser =
    !canEditAlbumCover &&
    titleEditing &&
    coverUploadEnabled &&
    Boolean(coverPlaylistId);

  const showAlbumCoverEditChrome = showProCoverEditUi || showFreeCoverEditTeaser;

  const hasCustomCover = Boolean(showCoverImage && albumCoverUrl);
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const coverMenuRef = useRef<HTMLDivElement | null>(null);

  const rawAlbumTitle =
    tracks.length > 0 ? (selectedFolderName?.trim() || 'Untitled playlist') : null;
  const displayAlbumTitle = rawAlbumTitle
    ? truncatePlaylistNameForDisplay(rawAlbumTitle)
    : null;
  const albumTitleTooltip =
    rawAlbumTitle && rawAlbumTitle.length > PLAYLIST_NAME_MAX_LENGTH
      ? rawAlbumTitle
      : undefined;
  
  // Extract accent for the main page background gradient only; everything else uses :root purple (layout.scss).
  useEffect(() => {
    if (!albumCoverUrl || !showCoverImage) {
      clearAlbumDrivenThemeOverrides();
      setIsAlbumCoverLoading(false);
      return;
    }

    setIsAlbumCoverLoading(true);

    extractDominantColor(albumCoverUrl)
      .then((dominantColor) => {
        clearAlbumDrivenThemeOverrides();
        const gradientStart = saturateColor(darkenColor(dominantColor, 20), 50);
        const gradientMiddle = saturateColor(darkenColor(dominantColor, 35), 50);
        const gradientEnd = '#1f1f2e';
        document.documentElement.style.setProperty('--bg-gradient-start', gradientStart);
        document.documentElement.style.setProperty('--bg-gradient-middle', gradientMiddle);
        document.documentElement.style.setProperty('--bg-gradient-end', gradientEnd);
      })
      .catch(() => {
        clearAlbumDrivenThemeOverrides();
      })
      .finally(() => {
        setIsAlbumCoverLoading(false);
      });
  }, [albumCoverUrl, showCoverImage]);

  // Extract file ID from Google Drive URL
  const extractFileId = (url: string): string | null => {
    try {
      if (url.includes('/api/drive-file')) {
        const urlObj = new URL(url, window.location.origin);
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
  };

  const handleDownload = useCallback(async () => {
    if (tracks.length === 0) return;

    // Cancel any existing download
    if (downloadAbortController.current) {
      downloadAbortController.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    downloadAbortController.current = abortController;

    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      const zip = new JSZip();
      const folderName = selectedFolderName || 'playlist';
      
      // Add each track to the ZIP
      for (let i = 0; i < tracks.length; i++) {
        // Check if download was aborted
        if (abortController.signal.aborted) {
          throw new Error('Download cancelled');
        }

        const track = tracks[i];
        if (track.file) {
          // Local file - add directly
          zip.file(track.name, track.file);
        } else if (track.googleDriveUrl) {
          // Google Drive file - use API endpoint
          try {
            const fileId = extractFileId(track.googleDriveUrl);
            if (fileId) {
              const response = await fetch(`/api/drive-file?id=${fileId}`, {
                signal: abortController.signal
              });
              if (response.ok) {
                const blob = await response.blob();
                zip.file(track.name, blob);
              } else {
                console.warn(`Failed to download ${track.name} from Google Drive`);
              }
            } else {
              console.warn(`Could not extract file ID from ${track.googleDriveUrl}`);
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              throw error;
            }
            console.warn(`Failed to download ${track.name}:`, error);
          }
        } else if (track.url) {
          // Generic URL - try direct fetch
          try {
            const response = await fetch(track.url, {
              signal: abortController.signal
            });
            if (response.ok) {
              const blob = await response.blob();
              zip.file(track.name, blob);
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              throw error;
            }
            console.warn(`Failed to download ${track.name}:`, error);
          }
        }
        
        // Update progress
        setDownloadProgress(Math.round(((i + 1) / tracks.length) * 100));
      }

      // Check if download was aborted before generating ZIP
      if (abortController.signal.aborted) {
        throw new Error('Download cancelled');
      }

      // Generate and download the ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setDownloadProgress(100);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Download cancelled by user');
        return;
      }
      console.error('Failed to create ZIP:', error);
      alert('Failed to download playlist. Please try again.');
    } finally {
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
        downloadAbortController.current = null;
      }, 500);
    }
  }, [tracks, selectedFolderName]);

  // Cleanup: abort download on unmount or page refresh
  useEffect(() => {
    return () => {
      if (downloadAbortController.current) {
        downloadAbortController.current.abort();
      }
    };
  }, []);

  // Handle page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (downloadAbortController.current) {
        downloadAbortController.current.abort();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const startTitleEdit = useCallback(() => {
    if (!allowTitleRename || tracks.length === 0) return;
    const current = selectedFolderName?.trim() || 'Untitled playlist';
    titleSnapshotRef.current = current;
    setTitleDraft(current.slice(0, PLAYLIST_NAME_MAX_LENGTH));
    titleEditingRef.current = true;
    setTitleEditing(true);
  }, [allowTitleRename, tracks.length, selectedFolderName]);

  const cancelTitleEdit = useCallback(() => {
    titleEditingRef.current = false;
    setTitleDraft(titleSnapshotRef.current);
    setTitleEditing(false);
  }, []);

  const commitTitleEdit = useCallback(async () => {
    if (!titleEditingRef.current || !onAlbumTitleChange) {
      return;
    }
    let next = titleDraft.trim();
    if (!next) {
      next = titleSnapshotRef.current || 'Untitled playlist';
    }
    next = next.slice(0, PLAYLIST_NAME_MAX_LENGTH);
    titleEditingRef.current = false;
    setTitleEditing(false);
    if (next !== titleSnapshotRef.current) {
      await Promise.resolve(onAlbumTitleChange(next));
    }
  }, [onAlbumTitleChange, titleDraft]);

  /** Blur commits title unless focus moves into album art (cover menu / overlay). */
  const handleTitleInputBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const next = e.relatedTarget as HTMLElement | null;
      if (next?.closest?.('.album-art-cover-hit') || next?.closest?.('.album-art')) {
        return;
      }
      void commitTitleEdit();
    },
    [commitTitleEdit]
  );

  const handleCoverFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !coverPlaylistId || !onCoverUploaded) return;
      try {
        setCoverUploading(true);
        setCoverError(null);
        const blob = await squareCenterCropToJpegBlob(file);
        const formData = new FormData();
        formData.append('file', blob, 'cover.jpg');
        formData.append('playlistId', coverPlaylistId);
        const res = await fetch('/api/playlists/cover', { method: 'POST', body: formData });
        const data = (await res.json()) as { error?: string; playlist?: SavedPlaylist };
        if (!res.ok) {
          setCoverError(data.error ?? 'Upload failed');
          return;
        }
        if (data.playlist) {
          onCoverUploaded(data.playlist);
        }
      } catch (err) {
        setCoverError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setCoverUploading(false);
      }
    },
    [coverPlaylistId, onCoverUploaded]
  );

  useEffect(() => {
    if (!titleEditing) {
      setCoverError(null);
      setCoverMenuOpen(false);
    }
  }, [titleEditing]);

  useEffect(() => {
    if (!coverMenuOpen) return;
    const onDocDown = (ev: MouseEvent) => {
      const el = coverMenuRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setCoverMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [coverMenuOpen]);

  useEffect(() => {
    if (titleEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [titleEditing]);

  return (
    <div className={`main-content ${tracks.length === 0 ? 'centered' : ''}`}>
      <div
        className={`album-art${showAlbumCoverEditChrome ? ' album-art--cover-edit' : ''}`}
      >
        {albumCoverUrl && showCoverImage ? (
          <>
            <img 
              src={albumCoverUrl} 
              alt="Album Cover"
              className="album-art-image"
              onLoad={() => setIsAlbumCoverLoading(false)}
              onError={(e) => {
                // Fall back to default if image fails to load
                setIsAlbumCoverLoading(false);
                e.currentTarget.style.display = 'none';
                const defaultDiv = e.currentTarget.nextElementSibling?.nextElementSibling;
                if (defaultDiv) {
                  (defaultDiv as HTMLElement).style.display = 'flex';
                }
              }}
            />
            {isAlbumCoverLoading && (
              <div className="album-art-spinner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
              </div>
            )}
          </>
        ) : null}
        <div className="album-art-default" style={{ display: (albumCoverUrl && showCoverImage) ? 'none' : 'flex' }}></div>
        {showProCoverEditUi && (
          <>
            <input
              ref={coverFileInputRef}
              type="file"
              className="album-art-file-input"
              accept="image/*"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => void handleCoverFileChange(e)}
            />
            <div className="album-art-cover-hit" ref={coverMenuRef}>
              <button
                type="button"
                className={`album-art-cover-overlay${coverUploading ? ' album-art-cover-overlay--busy' : ''}`}
                disabled={coverUploading}
                onPointerDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  if (coverUploading) return;
                  setCoverError(null);
                  setCoverMenuOpen((o) => !o);
                }}
                aria-expanded={coverMenuOpen}
                aria-haspopup="menu"
                aria-label="Album cover options"
              >
                {coverUploading ? (
                  <span className="album-art-cover-overlay-spinner" aria-hidden>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  </span>
                ) : (
                  <Pencil size={32} strokeWidth={2} aria-hidden />
                )}
              </button>
              {coverMenuOpen && !coverUploading && (
                <div className="album-art-cover-menu" role="menu">
                  <button
                    type="button"
                    className="album-art-cover-menu-item"
                    role="menuitem"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setCoverMenuOpen(false);
                      setCoverError(null);
                      coverFileInputRef.current?.click();
                    }}
                  >
                    <Image size={17} strokeWidth={2} className="album-art-cover-menu-icon" aria-hidden />
                    <span>Change image</span>
                  </button>
                  <button
                    type="button"
                    className="album-art-cover-menu-item"
                    role="menuitem"
                    disabled={!hasCustomCover || !onCoverRemoved}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!hasCustomCover || !onCoverRemoved) return;
                      setCoverMenuOpen(false);
                      void Promise.resolve(onCoverRemoved());
                    }}
                  >
                    <Trash2 size={17} strokeWidth={2} className="album-art-cover-menu-icon" aria-hidden />
                    <span>Remove cover</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        {showFreeCoverEditTeaser && (
          <div className="album-art-cover-hit">
            <button
              type="button"
              className="album-art-cover-overlay"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onAlbumCoverRequiresPro?.()}
              aria-label="Album cover editing requires Pro"
            >
              <Pencil size={32} strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}
        {coverError && (
          <div className="album-art-cover-error" role="alert">
            {coverError}
          </div>
        )}
      </div>
      <div className="info-section">
        {tracks.length === 0 ? (
          <h1
            className="title"
            title={
              selectedFolderName && selectedFolderName.trim().length > PLAYLIST_NAME_MAX_LENGTH
                ? selectedFolderName.trim()
                : undefined
            }
          >
            {selectedFolderName?.trim()
              ? truncatePlaylistNameForDisplay(selectedFolderName.trim())
              : `Drop your playlist here!`}
          </h1>
        ) : hasPlaylistRenameHandler ? (
          titleEditing ? (
            <div className="album-title-row album-title-row--editing">
              <input
                ref={titleInputRef}
                className="title album-title-input"
                value={titleDraft}
                maxLength={PLAYLIST_NAME_MAX_LENGTH}
                aria-label="Album name"
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleInputBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void commitTitleEdit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelTitleEdit();
                  }
                }}
              />
            </div>
          ) : (
            <div className="album-title-heading">
              <h1
                className="title album-title-text"
                title={albumTitleTooltip}
                onDoubleClick={startTitleEdit}
              >
                {displayAlbumTitle}
              </h1>
            </div>
          )
        ) : (
          <div className="album-title-heading">
            <h1 className="title" title={albumTitleTooltip}>
              {displayAlbumTitle}
            </h1>
          </div>
        )}
        <p className="subtitle">
          {tracks.length > 0 ? (
            <>
              {tracks.length} tracks{albumDurationReady ? `, ${formatDuration(totalDuration)}` : ''}
              {tracks.some(track => track.googleDriveUrl) ? (
                <Cloud size={16} style={{ marginLeft: '8px', opacity: 0.8 }} />
              ) : (
                <File size={16} style={{ marginLeft: '8px', opacity: 0.8 }} />
              )}
            </>
          ) : (
            'Ready to drop?'
          )}
        </p>
        <div className="buttons">
          {tracks.length > 0 && (
            <>
              <button 
                className="play-btn"
                onClick={() => {
                  if (headerShowsPause) {
                    onPlayPause();
                  } else if (currentIndex === -1) {
                    onPlayFirst();
                  } else {
                    onPlayPause();
                  }
                }}
              >
                {headerShowsPause ? <Pause size={19} /> : <Play size={19} />}
                {headerShowsPause ? 'Pause' : 'Play'}
              </button>
              <button 
                className="download-btn" 
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download size={19} />
                    Download
                  </>
                )}
              </button>
              {hasPlaylistRenameHandler && !titleEditing && (
                <button
                  type="button"
                  className="playlist-header-edit-btn"
                  onClick={startTitleEdit}
                  aria-label="Edit playlist name"
                >
                  <Pencil size={19} strokeWidth={2} aria-hidden />
                  Edit
                </button>
              )}
            </>
          )}
          {isDownloading && (
            <div style={{ width: '100%', marginTop: '1rem' }}>
              <Progress 
                percent={downloadProgress} 
                status="active"
                strokeColor={{
                  '0%': 'rgba(255, 255, 255, 0.1)',
                  '100%': 'rgba(255, 255, 255, 0.3)',
                }}
                trailColor="rgba(255, 255, 255, 0.05)"
                className="download-progress"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

