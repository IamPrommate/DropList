"use client";

import { useState } from 'react';
import { TrackType, SavedPlaylist } from '../lib/types';
import { getPlaylistCoverUrl } from '../lib/playlistCover';
import GoogleDrivePicker from './GoogleDrivePicker';
import ConfirmModal from './ConfirmModal';
import Spinner from './Spinner';
import { Music, Trash2, LogIn } from 'lucide-react';
import { signIn } from 'next-auth/react';

interface SidebarProps {
  isLoggedIn: boolean;
  isPro: boolean;
  savedPlaylists: SavedPlaylist[];
  activePlaylistId: string | null;
  tracks: TrackType[];
  onGoogleDrivePicked: (picked: TrackType[], folderName?: string, albumCoverUrl?: string | null, driveFolderId?: string | null) => void;
  onSelectPlaylist: (playlist: SavedPlaylist) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onAddBlocked: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  loadingPlaylistId: string | null;
  loadingPlaylists: boolean;
}

export default function Sidebar({
  isLoggedIn,
  isPro,
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
}: SidebarProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const canAddPlaylist = isPro || savedPlaylists.length === 0;

  const pendingPlaylist = savedPlaylists.find((pl) => pl.id === pendingDeleteId);

  return (
    <>
      <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            {!collapsed && <h2 className="sidebar-title">DropList</h2>}
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
                      addBlocked={!canAddPlaylist}
                      onAddBlocked={onAddBlocked}
                    />
                  )}
                </div>

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
                    return (
                    <div
                      key={pl.id}
                      className={`playlist-item ${pl.id === activePlaylistId ? 'active' : ''} ${loadingPlaylistId === pl.id ? 'loading' : ''}`}
                      onClick={() => onSelectPlaylist(pl)}
                    >
                      <div className="playlist-icon" aria-hidden>
                        {rowCoverUrl ? (
                          <img src={rowCoverUrl} alt="" className="playlist-cover-thumb" />
                        ) : (
                          <div className="playlist-thumb-default" />
                        )}
                      </div>
                      <div className="playlist-info">
                        <div className="playlist-name">{pl.name}</div>
                        {pl.id === activePlaylistId && tracks.length > 0 && (
                          <div className="playlist-count">{tracks.length} tracks</div>
                        )}
                        {loadingPlaylistId === pl.id && (
                          <div className="playlist-count">
                            <Spinner size={12} /> Loading…
                          </div>
                        )}
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
        danger
        onConfirm={() => {
          if (pendingDeleteId) {
            onDeletePlaylist(pendingDeleteId);
          }
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}
