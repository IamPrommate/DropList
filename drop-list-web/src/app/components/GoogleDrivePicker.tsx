"use client";

import { useState } from "react";
import { Modal, Input, Space, Alert } from "antd";
import type { TrackType } from "../lib/types";
import { matchArtistImages } from "../../utils/track";
import { isAudioFile, FileType } from "../lib/common";
import { Cloud, Plus } from "lucide-react";
import Spinner from "./Spinner";
import "./google-drive.scss";

type Props = {
  onPicked: (tracks: TrackType[], folderName?: string, albumCoverUrl?: string | null, driveFolderId?: string | null) => void;
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


async function buildStreamUrl(fileId: string): Promise<string> {
  // Same-origin only: googleapis ?alt=media is not CORS-safe for <audio>/<video> in the browser.
  return `/api/drive-file?id=${fileId}`;
}

// Use server-side API to fetch folder contents (no CORS issues)
async function fetchFolderFiles(
  folderId: string
): Promise<{ files: DriveFolderFile[]; folderName?: string; albumCoverUrl?: string | null; error?: string }> {
  try {
    console.log("Fetching folder via server API:", folderId);

    const response = await fetch("/api/drive-folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ folderId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Server error: ${response.statusText}`
      );
    }

    const data = await response.json();

    if (data.error) {
      return { files: [], folderName: data.folderName, albumCoverUrl: data.albumCoverUrl || null, error: data.error };
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
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    setLoading(true);

    try {
    const tracks: TrackType[] = [];
    let folderName: string | undefined;
    let firstDriveFolderId: string | null = null;
    let lastError: string | undefined;

    for (const line of lines) {
      try {
        const folderId = extractDriveFolderId(line);
        if (folderId) {
          const folderData = await fetchFolderFiles(folderId);

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

          const filePromises = audioFiles.map(async (file, i) => {
            const url = await buildStreamUrl(file.id);

            let stageViewVideoUrl = undefined;
            const videoId = artistVideoMap.get(file.id);
            if (videoId) {
              stageViewVideoUrl = await buildStreamUrl(videoId);
            }

            return {
              id: `${Date.now()}_${file.id}_${i}`,
              name: file.name,
              googleDriveUrl: url,
              stageViewVideoUrl,
            };
          });

          const folderTracks = await Promise.all(filePromises);
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
      onPicked(tracks, folderName, null, firstDriveFolderId);
      setOpen(false);
      setRaw("");
    } else {
      const errorMessage = lastError || "No valid Google Drive folder links found. Please paste Google Drive folder share links only.";
      alert(errorMessage);
    }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {variant === 'dropdown' ? (
        <div className="dropdown-item" onClick={() => setOpen(true)}>
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
            setOpen(true);
          }}
        >
          <Plus size={16} />
          <span>Add Playlist</span>
        </button>
      ) : (
        <button className="add-btn-ggd" onClick={() => setOpen(true)}>
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
        onCancel={() => { if (!loading) setOpen(false); }}
        okText={loading ? 'Loading…' : 'Add'}
        okButtonProps={{ disabled: loading }}
        cancelButtonProps={{ disabled: loading }}
        closable={!loading}
        maskClosable={!loading}
        centered
        className="drive-modal"
      >
        <Space direction="vertical" size="small" className="drive-modal-body-stack" style={{ width: '100%' }}>
          <Alert
            type="info"
            message="Paste Google Drive folder share links (one per line). Folder must be shared publicly."
          />
          {loading ? (
            <div className="drive-modal-loading">
              <Spinner size={18} />
              <span>Fetching playlist from Drive…</span>
            </div>
          ) : (
            <Input.TextArea
              rows={7}
              placeholder="Google Drive folder share links"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          )}
        </Space>
      </Modal>
    </>
  );
}
