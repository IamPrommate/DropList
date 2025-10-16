"use client";

import { useMemo, useState } from "react";
import { Modal, Input, Space, Alert } from "antd";
import type { TrackType } from "../lib/types";
import { matchArtistImages } from "../../utils/track";
import { isAudioFile, isImageFile } from "../lib/common";
import "./google-drive.scss";

type Props = {
  onPicked: (tracks: TrackType[], folderName?: string) => void;
  variant?: 'button' | 'dropdown';
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
): Promise<{ files: { id: string; name: string }[]; folderName?: string; error?: string }> {
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
      return { files: [], folderName: data.folderName, error: data.error };
    }

    console.log("Successfully found files:", data.files);
    return { files: data.files, folderName: data.folderName };
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

          // Extract files array and folder name
          const files = folderData.files || [];
          const currentFolderName = folderData.folderName;
          
          // Separate audio and image files using enums
          const audioFiles = files.filter((file) => isAudioFile(file.name));
          const imageFiles = files.filter((file) => isImageFile(file.name));
          
          // Match artist images with tracks
          const artistImageMap = matchArtistImages(audioFiles, imageFiles);
          
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

            return {
              id: `${Date.now()}_${file.id}_${i}`,
              name: file.name,
              googleDriveUrl: url,
              artistImageUrl,
            };
          });

          const folderTracks = await Promise.all(filePromises);
          tracks.push(...folderTracks);
          
          // Store folder name for the first folder processed
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
      onPicked(tracks, folderName);
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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14m-7-7h14"></path>
          </svg>
          Add from Google Drive
        </div>
      ) : (
        <button className="add-btn-ggd" onClick={() => setOpen(true)}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14m-7-7h14"></path>
          </svg>
          Add from Google Drive
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
