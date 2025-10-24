import { useCallback, useState, useRef, useEffect } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import { Progress } from 'antd';
import { formatDuration } from '../../utils/time';
import JSZip from 'jszip';

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
  onPlayPause: () => void;
  onPlayFirst: () => void;
}

export default function PlaylistHeader({
  tracks,
  selectedFolderName,
  totalDuration,
  isPlaying,
  currentIndex,
  onPlayPause,
  onPlayFirst,
}: PlaylistHeaderProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadAbortController = useRef<AbortController | null>(null);

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
        <div className="album-art-default"></div>
      </div>
      <div className="info-section">
        <h1 className="title">{selectedFolderName || `Drop your playlist here!`}</h1>
        <p className="subtitle">
          {tracks.length > 0 
            ? `${tracks.length} tracks, ${formatDuration(totalDuration)}`
            : 'Ready to drop?'
          }
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

