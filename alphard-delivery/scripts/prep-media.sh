#!/usr/bin/env bash
# Muat turun footage asal dari Google Drive dan tukar ke format sedia-edit:
# portrait 1080x1920, 30fps, H.264, TANPA audio (video akhir senyap + SFX sahaja).
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=${RAW_DIR:-.raw}
mkdir -p "$RAW" assets/footage assets/img
# id-google-drive  nama-asal  nama-pendek
while read -r id name short; do
  [ -f "$RAW/$name" ] || curl -sSL -o "$RAW/$name" "https://drive.usercontent.google.com/download?id=$id&export=download&confirm=t"
  case "$name" in
    *.mp4) [ -f "assets/footage/$short.mp4" ] || ffmpeg -nostdin -v error -y -i "$RAW/$name" -an \
             -vf "scale=1080:1920:flags=lanczos,fps=30,format=yuv420p" \
             -c:v libx264 -preset medium -crf 20 -g 15 -movflags +faststart "assets/footage/$short.mp4" ;;
    *.jpg) [ -f "assets/img/$short.jpg" ] || ffmpeg -nostdin -v error -y -i "$RAW/$name" -vf "scale=1080:-2" -q:v 3 "assets/img/$short.jpg" ;;
  esac
done <<'LIST'
1FkcAk94fsawA8B28WL96ixcCyuoEsmOO VID_20261031_193713568.mp4 c01-family-wave
1_X_1LWDatWVeNaMZ1hxhDdqdVh6VXZ5j VID_20261031_193728321.mp4 c02-dad-daughter
1gUSX9a7bCEosJRJ_0JqRcvmt6xeur3Zq VID_20261031_193738342.mp4 c03-family-wide
1immLyXWYVZ2dON_GhAIC0f_BCJJ0edu_ IMG_20261031_193849702.jpg family-photo
1GkwquqUVNqjzq4N2SNmOTOjzPLbEE1Ww VID_20261031_193855999.mp4 c04-mum-kids-bow
1qLegYvPrTJgYloVt1zCC4kL-UZtx9Mtw VID_20261031_194013869.mp4 c05-open-door
1_cyM1r6mwiI_ih98GK3J1gOMtdJzL6FZ VID_20261031_194028611.mp4 c06-check-cabin
1JeFCpsPJDE_GHAwD7U6NJRc8uKCY38ag VID_20261031_194054711.mp4 c07-kids-inside
1onY6sCBPJImbeOO4Fb-uywxvy39r4uw3 VID_20261031_194107193.mp4 c08-headlights
1jMuMrjOwL2C854oIJU0pPPbIg6eIkTgm VID_20261031_194256830.mp4 c09-taillights
1BZ5J1Y217rl0r-Zgkf48Cgzqa8OLmcuW VID_20261031_194325007.mp4 c10-bouquet-bow
1V-5Wsfllk2_p0-8S2W1DsyuJH6xHGDmH VID_20261031_194445513.mp4 c11-photographer
14N-tbx7FQa3pC5dyEAsiHiu3xt3NQSyD VID_20261031_195425531.mp4 c12-grille-drl
1SQc60uHX8EP3Nl-fFIF0pw3nvtTgsWud VID_20261031_195515751.mp4 c13-drive-off
LIST
ls -la assets/footage assets/img
