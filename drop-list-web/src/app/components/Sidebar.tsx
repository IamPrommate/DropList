"use client";

import { Dropdown } from 'antd';
import { TrackType } from '../lib/types';
import GoogleDrivePicker from './GoogleDrivePicker';
import { Music, Plus, FolderOpen } from 'lucide-react';

interface SidebarProps {
  selectedFolderName: string | null;
  tracks: TrackType[];
  onFolderPick: () => void;
  onGoogleDrivePicked: (picked: TrackType[], folderName?: string) => void;
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
                          Add from local
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
