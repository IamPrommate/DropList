import { useCallback, useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Cloud, File } from 'lucide-react';
import { Progress } from 'antd';
import { formatDuration } from '../../utils/time';
import JSZip from 'jszip';
import { extractDominantColor, lightenColor, darkenColor, saturateColor, shiftHue, hexToRgba, rgbToHsl, hexToRgb } from '../../utils/color';

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
  isPlaying: boolean;
  currentIndex: number;
  albumCoverUrl?: string | null;
  showCoverImage?: boolean;
  onPlayPause: () => void;
  onPlayFirst: () => void;
}

export default function PlaylistHeader({
  tracks,
  selectedFolderName,
  totalDuration,
  isPlaying,
  currentIndex,
  albumCoverUrl,
  showCoverImage = true,
  onPlayPause,
  onPlayFirst,
}: PlaylistHeaderProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadAbortController = useRef<AbortController | null>(null);
  const [isAlbumCoverLoading, setIsAlbumCoverLoading] = useState(!!albumCoverUrl);
  
  // Extract and apply dynamic colors when album cover loads
  useEffect(() => {
    if (albumCoverUrl && showCoverImage) {
      setIsAlbumCoverLoading(true);
      
      extractDominantColor(albumCoverUrl)
        .then((dominantColor) => {
          console.log('Extracted dominant color:', dominantColor);
          
          const gradientStart = saturateColor(darkenColor(dominantColor, 30), 40);
          const gradientMiddle = saturateColor(darkenColor(dominantColor, 45), 40);
          const gradientEnd = '#000e1a';
          
          // Apply to background gradient
          document.documentElement.style.setProperty('--bg-gradient-start', gradientStart);
          document.documentElement.style.setProperty('--bg-gradient-middle', gradientMiddle);
          document.documentElement.style.setProperty('--bg-gradient-end', gradientEnd);
          
          // Apply to switch colors
          document.documentElement.style.setProperty('--switch-bg', hexToRgba(lightenColor(dominantColor, 25), 0.3));
          document.documentElement.style.setProperty('--switch-border', hexToRgba(lightenColor(dominantColor, 25), 0.5));
          document.documentElement.style.setProperty('--switch-checked-bg', hexToRgba(lightenColor(dominantColor, 25), 0.8));
          document.documentElement.style.setProperty('--switch-checked-border', lightenColor(dominantColor, 25));
          document.documentElement.style.setProperty('--switch-hover', hexToRgba(lightenColor(dominantColor, 25), 0.4));
          document.documentElement.style.setProperty('--switch-checked-hover', hexToRgba(lightenColor(dominantColor, 25), 0.9));
          
          // Apply to shadow colors for consistent theming
          const [r, g, b] = hexToRgb(dominantColor);
          document.documentElement.style.setProperty('--shadow-primary', `rgba(${r}, ${g}, ${b}, 0.25)`);
          document.documentElement.style.setProperty('--shadow-primary-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
          document.documentElement.style.setProperty('--playlist-active-shadow', `rgba(${r}, ${g}, ${b}, 0.15)`);
          
          // Apply to player border for consistent theming
          document.documentElement.style.setProperty('--player-border', hexToRgba(lightenColor(dominantColor, 25), 0.2));
          
          console.log('Applied TYPE 1 colors:', { dominantColor, gradientStart, gradientMiddle, gradientEnd });
          
          // TYPE 2: Apply hue angle shift to primary accent colors
          const originalMiddle = '#00f594';
          
          const [origR, origG, origB] = hexToRgb(originalMiddle);
          const originalHue = rgbToHsl(origR, origG, origB);
          const [extR, extG, extB] = hexToRgb(dominantColor);
          const extractedHue = rgbToHsl(extR, extG, extB);
          
          let hueShift = extractedHue[0] - originalHue[0];
          
          if (hueShift > 180) hueShift -= 360;
          if (hueShift < -180) hueShift += 360;
          
          const originalColors = {
            start: '#00f594',
            middle: '#00d681',
            end: '#00d07e',
            hoverStart: '#2ef7a7',
            hoverMiddle: '#00e686',
            hoverEnd: '#00d681'
          };
          
          document.documentElement.style.setProperty('--primary-gradient-start', shiftHue(originalColors.start, hueShift));
          document.documentElement.style.setProperty('--primary-gradient-middle', shiftHue(originalColors.middle, hueShift));
          document.documentElement.style.setProperty('--primary-gradient-end', shiftHue(originalColors.end, hueShift));
          document.documentElement.style.setProperty('--primary-gradient-hover-start', shiftHue(originalColors.hoverStart, hueShift));
          document.documentElement.style.setProperty('--primary-gradient-hover-middle', shiftHue(originalColors.hoverMiddle, hueShift));
          document.documentElement.style.setProperty('--primary-gradient-hover-end', shiftHue(originalColors.hoverEnd, hueShift));
        })
        .catch((error) => {
          console.error('Failed to extract color:', error);
        })
        .finally(() => {
          setIsAlbumCoverLoading(false);
        });
    } else if (!showCoverImage) {
      document.documentElement.style.setProperty('--bg-gradient-start', '#152028');
      document.documentElement.style.setProperty('--bg-gradient-middle', '#0f1921');
      document.documentElement.style.setProperty('--bg-gradient-end', '#000e1a');
      
      document.documentElement.style.setProperty('--switch-bg', 'rgba(0, 245, 148, 0.2)');
      document.documentElement.style.setProperty('--switch-border', 'rgba(0, 245, 148, 0.35)');
      document.documentElement.style.setProperty('--switch-checked-bg', 'rgba(0, 245, 148, 0.7)');
      document.documentElement.style.setProperty('--switch-checked-border', '#00f594');
      document.documentElement.style.setProperty('--switch-hover', 'rgba(0, 245, 148, 0.3)');
      document.documentElement.style.setProperty('--switch-checked-hover', 'rgba(0, 245, 148, 0.8)');
      
      document.documentElement.style.setProperty('--shadow-primary', 'rgba(0, 245, 148, 0.12)');
      document.documentElement.style.setProperty('--shadow-primary-glow', 'rgba(0, 245, 148, 0.18)');
      document.documentElement.style.setProperty('--playlist-active-shadow', 'rgba(0, 245, 148, 0.08)');
      
      document.documentElement.style.setProperty('--player-border', 'rgba(255, 255, 255, 0.08)');
      
      document.documentElement.style.setProperty('--primary-gradient-start', '#00f594');
      document.documentElement.style.setProperty('--primary-gradient-middle', '#00d681');
      document.documentElement.style.setProperty('--primary-gradient-end', '#00d07e');
      document.documentElement.style.setProperty('--primary-gradient-hover-start', '#2ef7a7');
      document.documentElement.style.setProperty('--primary-gradient-hover-middle', '#00e686');
      document.documentElement.style.setProperty('--primary-gradient-hover-end', '#00d681');
    }
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

  return (
    <div className={`main-content ${tracks.length === 0 ? 'centered' : ''}`}>
      <div className="album-art">
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
      </div>
      <div className="info-section">
        <h1 className="title">{selectedFolderName || `Drop your playlist here!`}</h1> 
        <p className="subtitle">
          {tracks.length > 0 ? (
            <>
              {tracks.length} tracks, {formatDuration(totalDuration)}
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
                  if (currentIndex === -1) {
                    onPlayFirst();
                  } else {
                    onPlayPause();
                  }
                }}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button 
                className="download-btn" 
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download size={20} />
                    Download
                  </>
                )}
              </button>
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

