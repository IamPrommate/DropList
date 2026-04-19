"use client";

import { useState, useCallback, memo } from 'react';
import { TrackType, SavedPlaylist } from '../lib/types';
import {
  PLAYLIST_NAME_MAX_LENGTH,
  truncatePlaylistNameForDisplay,
} from '../lib/playlistNameLimits';
import { getPlaylistCoverUrl, playlistCoverUrlWithCacheBust } from '../lib/playlistCover';
import GoogleDrivePicker from './GoogleDrivePicker';
import ConfirmModal from './ConfirmModal';
import Spinner from './Spinner';
import { Music, Trash2, LogIn } from 'lucide-react';
import { signIn } from 'next-auth/react';

interface SidebarProps {
  isLoggedIn: boolean;
  /** When true, show “DropList Pro” in the sidebar header. */
  isPro: boolean;
  /** When true, user may add another saved playlist (plan + rank cap). */
  playlistAddAllowed: boolean;
  savedPlaylists: SavedPlaylist[];
  activePlaylistId: string | null;
  tracks: TrackType[];
  onGoogleDrivePicked: (
    picked: TrackType[],
    folderName?: string,
    albumCoverUrl?: string | null,
    driveFolderId?: string | null,
    tracksSubfolder?: string
  ) => void;
  onSelectPlaylist: (playlist: SavedPlaylist) => void;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onAddBlocked: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  loadingPlaylistId: string | null;
  loadingPlaylists: boolean;
  /** Bumped when any playlist cover changes so thumbnails refetch the same Storage URL. */
  coverCacheRev?: number;
  /** Saved playlist id that currently owns footer playback; omit when not applicable. */
  playbackPlaylistId?: string | null;
  /** True while the footer is actively playing audio. */
  isAudioPlaying?: boolean;
}

function Sidebar({
  isLoggedIn,
  isPro,
  playlistAddAllowed,
  savedPlaylists,
  activePlaylistId,
  tracks,
  onGoogleDrivePicked,
  onSelectPlaylist,
  onDeletePlaylist,
  onAddBlocked,
  collapsed,
  onToggleCollapse,
  loadingPlaylistId,
  loadingPlaylists,
  coverCacheRev = 0,
  playbackPlaylistId = null,
  isAudioPlaying = false,
}: SidebarProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId || deleteInProgress) return;
    setDeleteInProgress(true);
    try {
      await onDeletePlaylist(pendingDeleteId);
      setPendingDeleteId(null);
    } catch {
      /* keep modal open; optional: surface error later */
    } finally {
      setDeleteInProgress(false);
    }
  }, [pendingDeleteId, deleteInProgress, onDeletePlaylist]);

  const pendingPlaylist = savedPlaylists.find((pl) => pl.id === pendingDeleteId);

  return (
    <>
      <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            {!collapsed && (
              <h2 className="sidebar-title">{isPro ? 'DropList Pro' : 'DropList'}</h2>
            )}
            <button className="sidebar-toggle" onClick={onToggleCollapse}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {collapsed ? (
                  <path d="M9 18l6-6-6-6"></path>
                ) : (
                  <path d="M15 18l-6-6 6-6"></path>
                )}
              </svg>
            </button>
          </div>

          {!collapsed && (
            <>
              <div className="sidebar-playlists">
                <div className="playlists-header">
                  <h3 className="playlists-title">Playlists</h3>
                </div>

                {!loadingPlaylists && (
                  <div className="sidebar-add-buttons">
                    {!isLoggedIn ? (
                      <button className="sidebar-add-main-btn" onClick={() => signIn('google')}>
                        <LogIn size={16} />
                        <span>Sign in to add music</span>
                      </button>
                    ) : (
                      <GoogleDrivePicker
                        onPicked={onGoogleDrivePicked}
                        variant="sidebar"
                        addBlocked={!playlistAddAllowed}
                        onAddBlocked={onAddBlocked}
                      />
                    )}
                  </div>
                )}

                <div className="playlists-list">
                  {loadingPlaylists ? (
                    <div className="sidebar-loading">
                      <Spinner size={24} />
                      <span>Loading playlists…</span>
                    </div>
                  ) : (
                    <>
                  {savedPlaylists.map((pl) => {
                    const rowCoverUrl = getPlaylistCoverUrl(pl);
                    const rowCoverSrc = playlistCoverUrlWithCacheBust(rowCoverUrl, coverCacheRev);
                    const displayTrackCount =
                      loadingPlaylistId === pl.id
                        ? null
                        : pl.id === activePlaylistId && tracks.length > 0
                          ? tracks.length
                          : typeof pl.audio_track_count === 'number'
                            ? pl.audio_track_count
                            : null;
                    const rowOwnsPlayback =
                      isAudioPlaying && playbackPlaylistId != null && pl.id === playbackPlaylistId;
                    return (
                    <div
                      key={pl.id}
                      className={`playlist-item ${pl.id === activePlaylistId ? 'active' : ''} ${loadingPlaylistId === pl.id ? 'loading' : ''} ${rowOwnsPlayback ? 'playlist-item--playback-source' : ''}`}
                      onClick={() => onSelectPlaylist(pl)}
                    >
                      <div className="playlist-icon" aria-hidden>
                        {rowCoverSrc ? (
                          <img src={rowCoverSrc} alt="" className="playlist-cover-thumb" />
                        ) : (
                          <div className="playlist-thumb-default" />
                        )}
                      </div>
                      <div className="playlist-info">
                        <div
                          className="playlist-name"
                          title={
                            pl.name.length > PLAYLIST_NAME_MAX_LENGTH ? pl.name : undefined
                          }
                        >
                          {truncatePlaylistNameForDisplay(pl.name)}
                        </div>
                        {loadingPlaylistId === pl.id ? (
                          <div className="playlist-count">
                            <Spinner size={12} /> Loading…
                          </div>
                        ) : displayTrackCount != null ? (
                          <div className="playlist-count playlist-count-row">
                            {rowOwnsPlayback ? (
                              <span
                                className="playlist-playing-eq"
                                title="Playing from this playlist"
                                aria-label="Playing"
                              >
                                <span className="playlist-playing-eq__bar" />
                                <span className="playlist-playing-eq__bar" />
                                <span className="playlist-playing-eq__bar" />
                              </span>
                            ) : null}
                            <span>{displayTrackCount} tracks</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="playlist-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="playlist-action-btn playlist-action-delete"
                          title="Delete playlist"
                          onClick={() => setPendingDeleteId(pl.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    );
                  })}

                  {savedPlaylists.length === 0 && (
                    <div className="playlist-empty">
                      <div className="empty-icon">
                        <Music size={24} />
                      </div>
                      <div className="empty-text">No playlists yet</div>
                      <div className="empty-subtext">
                        {isLoggedIn ? 'Add music to create your first playlist' : 'Sign in to get started'}
                      </div>
                    </div>
                  )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingDeleteId}
        title="Delete Playlist"
        message={pendingPlaylist ? `Remove "${pendingPlaylist.name}" from your library?` : 'Remove this playlist?'}
        confirmLabel="Delete"
        confirmPending={deleteInProgress}
        confirmPendingLabel="Deleting…"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (deleteInProgress) return;
          setPendingDeleteId(null);
        }}
      />
    </>
  );
}

export default memo(Sidebar);
