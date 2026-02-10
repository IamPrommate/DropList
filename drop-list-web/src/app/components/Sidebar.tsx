"use client";

import { Dropdown } from 'antd';
import { signIn, signOut, useSession } from 'next-auth/react';
import { TrackType } from '../lib/types';
import GoogleDrivePicker from './GoogleDrivePicker';
import { Music, Plus, FolderOpen, LogIn, LogOut } from 'lucide-react';

interface SidebarProps {
  selectedFolderName: string | null;
  tracks: TrackType[];
  onFolderPick: () => void;
  onGoogleDrivePicked: (picked: TrackType[], folderName?: string, albumCoverUrl?: string | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({
  selectedFolderName,
  tracks,
  onFolderPick,
  onGoogleDrivePicked,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { data: session, status } = useSession();

  return (
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
            

            {/* Playlist List */}
            <div className="sidebar-playlists">
              <div className="playlists-header">
                <h3 className="playlists-title">Playlists</h3>
              </div>

            {/* Add Button */}
            <div className="sidebar-add-buttons">
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'local',
                      label: (
                        <div className="dropdown-item" onClick={onFolderPick}>
                          <FolderOpen size={16} />
                          Add From Local
                        </div>
                      ),
                    },
                    {
                      key: 'drive',
                      label: (
                        <GoogleDrivePicker
                          onPicked={onGoogleDrivePicked}
                          variant="dropdown"
                        />
                      ),
                    },
                  ],
                }}
                trigger={['hover']}
                placement="bottomLeft"
              >
                <button className="sidebar-add-main-btn">
                  <Plus size={16} />
                  Add Music
                </button>
              </Dropdown>
            </div>

              <div className="playlists-list">
                {selectedFolderName && (
                  <div className="playlist-item active">
                    <div className="playlist-icon">
                      <Music size={16} />
                    </div>
                    <div className="playlist-info">
                      <div className="playlist-name">{selectedFolderName}</div>
                      <div className="playlist-count">{tracks.length} tracks</div>
                    </div>
                  </div>
                )}
                {!selectedFolderName && tracks.length === 0 && (
                  <div className="playlist-empty">
                    <div className="empty-icon">
                      <Music size={24} />
                    </div>
                    <div className="empty-text">No playlists yet</div>
                    <div className="empty-subtext">Add music to create your first playlist</div>
                  </div>
                )}
              </div>

              {/* Google sign-in / account */}
              <div className="sidebar-auth">
                {status === 'loading' ? null : session ? (
                  <div className="sidebar-auth-signed-in">
                    <div className="sidebar-auth-user">
                      {session.user?.image ? (
                        <img
                          src={session.user.image}
                          alt=""
                          className="sidebar-auth-avatar"
                        />
                      ) : (
                        <div className="sidebar-auth-avatar-placeholder">
                          {(session.user?.name || session.user?.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="sidebar-auth-info">
                        <span className="sidebar-auth-name">
                          {session.user?.name || 'Signed in'}
                        </span>
                        {session.user?.email && (
                          <span className="sidebar-auth-email">{session.user.email}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="sidebar-auth-btn"
                      onClick={() => signOut()}
                      title="Sign out"
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sidebar-auth-btn sidebar-auth-sign-in"
                    onClick={() => signIn('google')}
                  >
                    <LogIn size={16} />
                    Sign in with Google
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
