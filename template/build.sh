#!/usr/bin/env bash
# Full render: video → audio mix (music + synthesized SFX [+ narration with music ducking]) → loudness → phone copy (<30 MB).
# Usage: ./build.sh <name>      e.g. ./build.sh mi-video
set -e
NAME=${1:-video}
MUSIC=audio/music.mp3; [ -f "$MUSIC" ] || MUSIC=""
VO=audio/vo.wav; [ -f "$VO" ] || VO=""
# Playwright's own Chromium if installed; otherwise CHROME_PATH (e.g. a system Chrome) is honoured by render.mjs
node render.mjs "_$NAME-silent.mp4" --mode ${MODE:-A}
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "_$NAME-silent.mp4")
PY=python3; [ -x .venv/bin/python ] && PY=.venv/bin/python
LOUD="loudnorm=I=-14:TP=-1.5:LRA=11"
if [ -n "$VO" ]; then
  # with narration: quieter bed + scribbles, and the bed ducks whenever the voice speaks
  MUSIC_GAIN=${MUSIC_GAIN:-0.26} SFX_GAIN=${SFX_GAIN:-0.32} SWELL=1 $PY sfx_mix.py "$D" "audio/_$NAME-bed.wav" $MUSIC
  ffmpeg -y -v error -i "_$NAME-silent.mp4" -i "audio/_$NAME-bed.wav" -i "$VO" -filter_complex \
    "[2:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,asplit=2[vo][key];[1:a][key]sidechaincompress=threshold=0.025:ratio=7:attack=12:release=380[bed];[bed][vo]amix=inputs=2:normalize=0:duration=first,$LOUD[a]" \
    -map 0:v -map "[a]" -ar 44100 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$NAME.mp4"
else
  SWELL=1 $PY sfx_mix.py "$D" "audio/_$NAME-mix.wav" $MUSIC
  ffmpeg -y -v error -i "_$NAME-silent.mp4" -i "audio/_$NAME-mix.wav" -af "$LOUD" -ar 44100 \
    -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$NAME.mp4"
fi
# phone/share copy: 2-pass to ~2.6 Mbps so it stays under messaging limits
ffmpeg -y -v error -i "$NAME.mp4" -c:v libx264 -preset slow -b:v 2600k -pass 1 -an -f mp4 /dev/null
ffmpeg -y -v error -i "$NAME.mp4" -c:v libx264 -preset slow -b:v 2600k -pass 2 -c:a aac -b:a 128k -movflags +faststart "$NAME-movil.mp4"
rm -f ffmpeg2pass* "_$NAME-silent.mp4"
echo "LISTO: $NAME.mp4 ($(du -h "$NAME.mp4" | cut -f1)) · $NAME-movil.mp4 ($(du -h "$NAME-movil.mp4" | cut -f1)) · ${D}s"
