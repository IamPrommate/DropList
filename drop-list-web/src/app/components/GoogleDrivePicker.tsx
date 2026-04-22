"use client";

import { useState } from "react";
import { Modal, Input, Space, Alert } from "antd";
import type { TrackType } from "../lib/types";
import { matchArtistImages } from "../../utils/track";
import { isAudioFile, FileType } from "../lib/common";
import { Cloud, Plus } from "lucide-react";
import Spinner from "./Spinner";
import "./google-drive.scss";
import {
  DRIVE_PERMISSION_BREAKS,
  DRIVE_SHARE_STEPS,
  parseDriveFolderError,
} from "../lib/driveSharingHelp";

type Props = {
  onPicked: (
    tracks: TrackType[],
    folderName?: string,
    albumCoverUrl?: string | null,
    driveFolderId?: string | null,
    /** Trimmed subfolder name, or "" when importing from the shared folder root */
    tracksSubfolder?: string
  ) => void;
  variant?: 'button' | 'dropdown' | 'sidebar';
  /** When false (at plan/rank playlist cap), open upgrade or limit modal instead of the Drive modal */
  addBlocked?: boolean;
  onAddBlocked?: () => void;
};

type DriveFolderFile = {
  id: string;
  name: string;
  type?: FileType;
  source?: 'root-folder' | 'artist-subfolder' | 'video-subfolder';
};

function extractDriveFolderId(input: string): string | null {
  // Supports: https://drive.google.com/drive/folders/FOLDER_ID?usp=share_link
  try {
    const url = new URL(input.trim());
    const pathParts = url.pathname.split("/").filter(Boolean);
    const foldersIndex = pathParts.indexOf("folders");
    if (foldersIndex !== -1 && pathParts[foldersIndex + 1]) {
      return pathParts[foldersIndex + 1];
    }
    return null;
  } catch {
    return null;
  }
}

function driveProxyStreamUrl(fileId: string): string {
  return `/api/drive-file?id=${encodeURIComponent(fileId)}`;
}

// Use server-side API to fetch folder contents (no CORS issues)
async function fetchFolderFiles(
  folderId: string,
  tracksSubfolder: string
): Promise<{
  files: DriveFolderFile[];
  folderName?: string;
  albumCoverUrl?: string | null;
  error?: string;
  code?: string;
}> {
  try {
    console.log("Fetching folder via server API:", folderId, "tracksSubfolder:", tracksSubfolder);

    const response = await fetch("/api/drive-folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ folderId, tracksSubfolder }),
    });

    const data = await response.json();

    if (data.error) {
      return {
        files: [],
        folderName: data.folderName,
        albumCoverUrl: data.albumCoverUrl || null,
        error: data.error,
        code: typeof data.code === "string" ? data.code : undefined,
      };
    }

    if (!response.ok) {
      throw new Error(
        (typeof data.error === "string" && data.error) || `Server error: ${response.statusText}`
      );
    }

    console.log("Successfully found files:", data.files);
    return { files: data.files, folderName: data.folderName, albumCoverUrl: data.albumCoverUrl || null };
  } catch (error) {
    console.error("Error fetching folder:", error);

    // error is unknown by default; safely extract message
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "string") {
      message = error;
    } else if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      message = (error as { message: string }).message;
    }

    throw new Error(
      `Failed to access folder: ${message}. Make sure the folder is shared publicly.`
    );
  }
}

export default function GoogleDrivePicker({
  onPicked,
  variant = 'button',
  addBlocked = false,
  onAddBlocked,
}: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [tracksSubfolder, setTracksSubfolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [pickError, setPickError] = useState<{ message: string; hint?: string } | null>(null);

  const openDriveModal = () => {
    setPickError(null);
    setOpen(true);
  };

  const handleConfirm = async () => {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    setLoading(true);
    setPickError(null);

    try {
    const tracks: TrackType[] = [];
    let folderName: string | undefined;
    let firstDriveFolderId: string | null = null;
    let lastError: string | undefined;

    for (const line of lines) {
      try {
        const folderId = extractDriveFolderId(line);
        if (folderId) {
          const folderData = await fetchFolderFiles(folderId, tracksSubfolder.trim());

          // Check if there's an error from the backend
          if (folderData.error) {
            lastError = folderData.error;
            console.error("Backend error:", folderData.error);
            continue; // Skip this folder but continue with others
          }

          // Extract files array, folder name, and album cover URL
          const files = folderData.files || [];
          const currentFolderName = folderData.folderName;

          // Separate audio and video files using enums
          const audioFiles = files.filter((file) => isAudioFile(file.name) && file.type === FileType.AUDIO);
          const artistVideos = files.filter((file) =>
            file.type === FileType.VIDEO &&
            file.source === 'video-subfolder'
          );

          const artistVideoMap = matchArtistImages(audioFiles, artistVideos);

          const folderTracks = audioFiles.map((file) => {
            const url = driveProxyStreamUrl(file.id);
            let stageViewVideoUrl: string | undefined;
            const videoId = artistVideoMap.get(file.id);
            if (videoId) {
              stageViewVideoUrl = driveProxyStreamUrl(videoId);
            }
            return {
              id: file.id,
              name: file.name,
              googleDriveUrl: url,
              stageViewVideoUrl,
            };
          });
          tracks.push(...folderTracks);
          
          if (!firstDriveFolderId) {
            firstDriveFolderId = folderId;
          }
          if (currentFolderName && !folderName) {
            folderName = currentFolderName;
          }
        } else {
          console.log("Invalid folder link:", line);
        }
      } catch (error) {
        console.error("Error processing:", line, error);
        // Capture the error message to show to user
        if (error instanceof Error) {
          lastError = error.message;
        } else if (typeof error === 'string') {
          lastError = error;
        }
      }
    }

    if (tracks.length > 0) {
      onPicked(tracks, folderName, null, firstDriveFolderId, tracksSubfolder.trim());
      setOpen(false);
      setRaw("");
      setTracksSubfolder("");
      setPickError(null);
    } else {
      const errorMessage =
        lastError ||
        "No valid Google Drive folder links found. Paste folder links only (not single-file links).";
      setPickError(parseDriveFolderError(errorMessage));
    }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {variant === 'dropdown' ? (
        <div className="dropdown-item" onClick={openDriveModal}>
          <Cloud size={16} />
          <span>Add From Google Drive</span>
        </div>
      ) : variant === 'sidebar' ? (
        <button
          type="button"
          className="sidebar-add-main-btn"
          onClick={() => {
            if (addBlocked) {
              onAddBlocked?.();
              return;
            }
            openDriveModal();
          }}
        >
          <Plus size={16} />
          <span>Add Playlist</span>
        </button>
      ) : (
        <button className="add-btn-ggd" onClick={openDriveModal}>
          <Cloud size={20} />
          <span>Add From Google Drive</span>
        </button>
      )}
      <Modal
        title={<span className="drive-modal-title-text">Add Google Drive audio links</span>}
        open={open}
        width={420}
        wrapClassName="drive-modal-wrap"
        onOk={handleConfirm}
        onCancel={() => {
          if (!loading) {
            setOpen(false);
            setTracksSubfolder("");
            setPickError(null);
          }
        }}
        okText={loading ? 'Loading…' : 'Add'}
        okButtonProps={{ disabled: loading }}
        cancelButtonProps={{ disabled: loading }}
        closable={!loading}
        maskClosable={!loading}
        centered
        className="drive-modal"
      >
        <Space direction="vertical" size="small" className="drive-modal-body-stack" style={{ width: '100%' }}>
          <div className="drive-modal-share-help">
            <p className="drive-modal-share-help-title">How to share your folder</p>
            <ol className="drive-modal-share-steps">
              {DRIVE_SHARE_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <details className="drive-modal-permission-details">
            <summary>What happens if I change permissions later?</summary>
            <ul className="drive-modal-permission-list">
              {DRIVE_PERMISSION_BREAKS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
          <p className="drive-modal-tracks-subfolder-hint" style={{ marginTop: 0 }}>
            Paste one folder link per line. DropList reads files through the link — your audio stays in Google Drive.
          </p>
          {pickError ? (
            <Alert type="error" message={pickError.message} description={pickError.hint} showIcon />
          ) : null}
          {loading ? (
            <div className="drive-modal-loading">
              <Spinner size={18} />
              <span>Fetching playlist from Drive…</span>
            </div>
          ) : (
            <>
              <Input.TextArea
                rows={7}
                placeholder="Google Drive folder share links"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <div className="drive-modal-tracks-subfolder">
                <label className="drive-modal-tracks-subfolder-label" htmlFor="drive-tracks-subfolder">
                  Tracks folder (optional)
                </label>
                <Input
                  id="drive-tracks-subfolder"
                  placeholder="Leave blank for audio in the shared folder root"
                  value={tracksSubfolder}
                  onChange={(e) => setTracksSubfolder(e.target.value)}
                  disabled={loading}
                />
                <p className="drive-modal-tracks-subfolder-hint">
                  Leave blank to import audio from the folder you shared (root only). If your MP3s live one level down,
                  enter that subfolder name exactly — case does not matter.
                </p>
              </div>
            </>
          )}
        </Space>
      </Modal>
    </>
  );
}
