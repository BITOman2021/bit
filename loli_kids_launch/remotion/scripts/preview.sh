#!/usr/bin/env bash
# Contact sheet (one frame per second, 12x5 grid) + short preview GIF from the final MP4.
set -euo pipefail
IN="${1:-out/loli_kids_launch_60s.mp4}"
OUT_DIR="$(dirname "$IN")"
ffmpeg -y -loglevel error -i "$IN" -vf "fps=1,scale=180:-1,tile=12x5:padding=4:color=white" -frames:v 1 "$OUT_DIR/contact_sheet.jpg"
ffmpeg -y -loglevel error -i "$IN" -vf "fps=6,scale=200:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer" "$OUT_DIR/preview.gif"
echo "wrote $OUT_DIR/contact_sheet.jpg and $OUT_DIR/preview.gif"
