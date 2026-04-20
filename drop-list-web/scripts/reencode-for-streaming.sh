#!/usr/bin/env bash
# Batch re-encode local audio to 192 kbps MP3 for smaller R2 egress/storage vs lossless or 320k masters.
# Requires ffmpeg (https://ffmpeg.org).
#
# Usage:
#   ./scripts/reencode-for-streaming.sh /path/to/masters /path/to/output
#
# Then upload the outputs to Google Drive (or swap files in place) so Drive→R2 copies store the smaller encode.
# Optional: set R2_AUDIO_TIER=standard and NEXT_PUBLIC_R2_AUDIO_TIER=standard so R2 keys are audio/standard/{fileId}
# (new namespace); legacy flat keys stay audio/{fileId} when tier env vars are unset.
set -euo pipefail

IN_DIR="${1:?Usage: $0 <input-dir> <output-dir>}"
OUT_DIR="${2:?Usage: $0 <input-dir> <output-dir>}"

mkdir -p "$OUT_DIR"

while IFS= read -r -d '' f; do
  rel="${f#"$IN_DIR"/}"
  base="$(basename "$rel")"
  stem="${base%.*}"
  dir_rel="$(dirname "$rel")"
  dest_dir="$OUT_DIR/$dir_rel"
  mkdir -p "$dest_dir"
  dest="$dest_dir/${stem}.mp3"
  echo "→ $dest"
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$f" -map_metadata 0 -c:a libmp3lame -b:a 192k "$dest"
done < <(find "$IN_DIR" -type f \( \
  -iname '*.mp3' -o -iname '*.flac' -o -iname '*.m4a' -o -iname '*.wav' -o -iname '*.aac' -o -iname '*.ogg' \
\) -print0)

echo "Done. Output under: $OUT_DIR"
