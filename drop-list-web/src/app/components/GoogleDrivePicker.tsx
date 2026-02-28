"use client";

import { useMemo, useState } from "react";
import { Modal, Input, Space, Alert } from "antd";
import type { TrackType } from "../lib/types";
import { matchArtistImages } from "../../utils/track";
import { isAudioFile, isImageFile, FileType } from "../lib/common";
import { Cloud } from "lucide-react";
import "./google-drive.scss";

type Props = {
  onPicked: (tracks: TrackType[], folderName?: string, albumCoverUrl?: string | null, driveFolderId?: string | null) => void;
  variant?: 'button' | 'dropdown';
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


async function buildStreamUrl(
  fileId: string,
  apiKey?: string | null
): Promise<string> {
  // Prefer Drive v3 media endpoint if API key provided and file is publicly accessible
  if (apiKey) {
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  }

  // Use server-side proxy to stream the file content directly
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

export default function GoogleDrivePicker({ onPicked, variant = 'button' }: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [useApiKey] = useState(false);
  const apiKey = useMemo(
    () => process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? null,
    []
  );

  const handleConfirm = async () => {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const tracks: TrackType[] = [];
    let folderName: string | undefined;
    let playlistAlbumCoverUrl: string | null = null;
    let firstDriveFolderId: string | null = null;
    let lastError: string | undefined;

    for (const line of lines) {
      try {
        // Only process folder links
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
          const albumCoverUrl = folderData.albumCoverUrl || null;
          
          // Separate audio, image, and video files using enums
          const audioFiles = files.filter((file) => isAudioFile(file.name) && file.type === FileType.AUDIO);
          const artistImages = files.filter((file) => 
            isImageFile(file.name) && 
            file.type === FileType.IMAGE && 
            file.source === 'artist-subfolder'
          );
          const artistVideos = files.filter((file) =>
            file.type === FileType.VIDEO &&
            file.source === 'video-subfolder'
          );
          
          // Match artist images and videos with tracks based on naming
          const artistImageMap = matchArtistImages(audioFiles, artistImages);
          const artistVideoMap = matchArtistImages(audioFiles, artistVideos);
          
          // Process audio files in parallel for better performance
          const filePromises = audioFiles.map(async (file, i) => {
            const url = await buildStreamUrl(
              file.id,
              useApiKey ? apiKey : null
            );

            // Get artist image URL if available
            let artistImageUrl = undefined;
            const imageId = artistImageMap.get(file.id);
            if (imageId) {
              artistImageUrl = await buildStreamUrl(
                imageId,
                useApiKey ? apiKey : null
              );
            }

            // Get stage view video URL if available
            let stageViewVideoUrl = undefined;
            const videoId = artistVideoMap.get(file.id);
            if (videoId) {
              stageViewVideoUrl = await buildStreamUrl(
                videoId,
                useApiKey ? apiKey : null
              );
            }

            return {
              id: `${Date.now()}_${file.id}_${i}`,
              name: file.name,
              googleDriveUrl: url,
              artistImageUrl,
              stageViewVideoUrl,
            };
          });

          const folderTracks = await Promise.all(filePromises);
          tracks.push(...folderTracks);
          
          // Store folder ID, name and album cover for the first folder processed
          if (!firstDriveFolderId) {
            firstDriveFolderId = folderId;
          }
          if (currentFolderName && !folderName) {
            folderName = currentFolderName;
          }
          if (albumCoverUrl) {
            playlistAlbumCoverUrl = albumCoverUrl;
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
      onPicked(tracks, folderName, playlistAlbumCoverUrl, firstDriveFolderId);
      setOpen(false);
      setRaw("");
    } else {
      // Show the specific backend error if available, otherwise show generic message
      const errorMessage = lastError || "No valid Google Drive folder links found. Please paste Google Drive folder share links only.";
      alert(errorMessage);
    }
  };

  return (
    <>
      {variant === 'dropdown' ? (
        <div className="dropdown-item" onClick={() => setOpen(true)}>
          <Cloud size={16} />
          <span>Add From Google Drive</span>
        </div>
      ) : (
        <button className="add-btn-ggd" onClick={() => setOpen(true)}>
          <Cloud size={20} />
          <span>Add From Google Drive</span>
        </button>
      )}
      <Modal
        title="Add Google Drive audio links"
        open={open}
        onOk={handleConfirm}
        onCancel={() => setOpen(false)}
        okText="Add"
        className="drive-modal"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Alert
            type="info"
            message="Paste Google Drive folder share links (one per line). Folder must be shared publicly."
          />
          {/* <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Switch 
              checked={useApiKey} 
              onChange={setUseApiKey}
            />
            <Typography.Text>
              Use API key streaming
              {apiKey ? "" : " (optional - no NEXT_PUBLIC_GOOGLE_API_KEY set)"}
            </Typography.Text>
          </div> */}
          <Input.TextArea
            rows={6}
            placeholder="Google Drive folder share links"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </Space>
      </Modal>
    </>
  );
}
