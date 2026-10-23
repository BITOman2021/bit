#!/usr/bin/env bash
# After `npm run render`: final true-peak limiting (video stream copied untouched),
# final mix WAV (24-bit/48k), QC report, previews.
set -euo pipefail
cd "$(dirname "$0")/.."
MP4=out/loli_kids_launch_60s.mp4
ffmpeg -y -loglevel error -i "$MP4" -c:v copy \
  -af "alimiter=limit=0.84:attack=5:release=60:level=disabled,aresample=48000" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart out/.limited.mp4
mv out/.limited.mp4 "$MP4"
ffmpeg -y -loglevel error -i "$MP4" -vn -ac 2 -ar 48000 -c:a pcm_s24le out/final_mix_48k_24bit.wav
python3 scripts/qc_report.py
bash scripts/preview.sh "$MP4"
